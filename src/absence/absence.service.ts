import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import axios from 'axios';
import * as moment from 'moment-timezone';

import { Absence } from './entities/absence.entity';
import { CreateAbsenceDto } from './dto/create-absence.dto';
import { UpdateAbsenceDto, CancelAbsenceDto } from './dto/update-absence.dto';
import {
  AbsenceSavedDto,
  AbsenceRecipientDto,
  SendAbsenceTemplateDto,
  SendAbsenceTemplateObjDto,
} from './dto/absence-email.dto';
import {
  AbsenceStatusEnum,
  AbsenceTimeTypeEnum,
  EventSyncStatusEnum,
  ABSENCE_END_OPTIONAL_REASONS,
} from './enums';
import { AbsenceApiClient } from './api/absence.api';

import { EmployeesService } from 'src/employees/employees.service';
import { EmployeeScheduleService } from 'src/employee_schedule/employee_schedule.service';
import { EmployeeSchedule } from 'src/employee_schedule/entities/employee_schedule.entity';
import { ScheduleEvent } from 'src/schedule_event/entities/schedule_event.entity';
import { RegisterEnum } from 'src/schedule_event/entities/register.enum';

/** Horario por default de una absence de día completo (America/Chicago). */
const FULL_DAY_START = '09:00';
const FULL_DAY_END = '18:00';

const TZ = 'America/Chicago';

@Injectable()
export class AbsenceService {
  private readonly logger = new Logger(AbsenceService.name);
  private readonly apiClient: AbsenceApiClient;

  constructor(
    @InjectRepository(Absence)
    private readonly absenceRepo: Repository<Absence>,
    @InjectRepository(ScheduleEvent)
    private readonly scheduleEventRepo: Repository<ScheduleEvent>,
    @InjectRepository(EmployeeSchedule)
    private readonly employeeScheduleRepo: Repository<EmployeeSchedule>,
    private readonly employeeService: EmployeesService,
    private readonly employeeScheduleService: EmployeeScheduleService,
  ) {
    this.apiClient = new AbsenceApiClient();
  }

  // ══════════════════════════════════════════════════════════════════════════
  // CREATE
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Registra una absence. No hay flujo de aprobación: nace 'Registered'.
   *
   * Orden: 1) guarda el registro  2) manda los correos  3) escribe el evento
   * de Outage en el master schedule.
   *
   * Los pasos 2 y 3 van en try/catch para que nada tumbe la API. El paso 3
   * marca event_sync_status para que un fallo quede visible y reintentable.
   */
  async create(createDto: CreateAbsenceDto): Promise<Absence> {
    this.validateDateCoherence(createDto);

    const chicagoNow = moment().tz(TZ);

    let saved: Absence;

    // ── 1. Guardar el registro ────────────────────────────────────────────
    try {
      const absence = this.absenceRepo.create({
        ...createDto,
        status: AbsenceStatusEnum.Registered,
        createdDate: chicagoNow.format('YYYY-MM-DD'),
        createdTime: chicagoNow.format('HH:mm:ss'),
        // Una absence no se paga ni autoriza recuperación de horas.
        is_paid: false,
        recovery_required: false,
        event_sync_status: EventSyncStatusEnum.Pending,
        event_sync_error: null,
        cancellation_info: null,
      });

      saved = await this.absenceRepo.save(absence);
      this.logger.log(`[create] Absence ${saved.id} registered for ${saved.employee_data?.employee_number}`);
    } catch (error) {
      this.logger.error('[create] Failed to save absence', error?.stack);
      throw new InternalServerErrorException('Error creating absence request');
    }

    // ── 2. Correos — non-blocking ─────────────────────────────────────────
    await this.notifyAbsenceCreated(saved);

    // ── 3. Evento en master schedule — non-blocking, pero con estado ──────
    await this.syncScheduleEvent(saved);

    return this.findOne(saved.id);
  }

  /**
   * Valida coherencia de fechas/horas. El DTO ya valida presencia y formato;
   * esto valida el orden, que el DTO no puede expresar.
   */
  private validateDateCoherence(dto: CreateAbsenceDto | UpdateAbsenceDto): void {
    if (dto.timeType === AbsenceTimeTypeEnum.Days && dto.startDate && dto.endDate) {
      if (moment(dto.endDate, 'YYYY-MM-DD').isBefore(moment(dto.startDate, 'YYYY-MM-DD'))) {
        throw new BadRequestException('endDate cannot be before startDate');
      }
    }

    if (dto.timeType === AbsenceTimeTypeEnum.Hours && dto.startTime && dto.endTime) {
      const start = this.hhmm(dto.startTime);
      const end = this.hhmm(dto.endTime);
      if (start && end && end <= start) {
        throw new BadRequestException('endTime must be after startTime');
      }
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // MASTER SCHEDULE — evento de Outage
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Escribe el/los evento(s) de Outage en el master schedule y deja constancia
   * del resultado en event_sync_status.
   *
   * Days  → un evento por cada día del rango (09:00–18:00 Chicago).
   * Hours → un solo evento en hourDate. end puede ir null si la razón es
   *         'No Internet' o 'Power Outage' (outage abierto).
   */
  private async syncScheduleEvent(absence: Absence): Promise<void> {
    try {
      const events = this.buildOutageEvents(absence);

      if (!events.length) {
        throw new Error('No outage events could be built from the absence');
      }

      await this.employeeScheduleService.create({
        employee_number: absence.employee_data.employee_number,
        fixed: [],
        events,
      } as any);

      await this.absenceRepo.update(absence.id, {
        event_sync_status: EventSyncStatusEnum.Synced,
        event_sync_error: null,
      });

      this.logger.log(`[syncScheduleEvent] ${events.length} outage event(s) created for absence ${absence.id}`);
    } catch (err: any) {
      const message = String(err?.message ?? err).slice(0, 1000);

      this.logger.warn(
        `[syncScheduleEvent] Failed for absence ${absence.id} (non-blocking): ${message}`,
      );

      // El fallo no tumba la request, pero queda registrado y es reintentable
      // vía PATCH /absence/:id/retry-event.
      try {
        await this.absenceRepo.update(absence.id, {
          event_sync_status: EventSyncStatusEnum.Failed,
          event_sync_error: message,
        });
      } catch (updateErr: any) {
        this.logger.error(
          `[syncScheduleEvent] Could not persist failure state for ${absence.id}: ${updateErr?.message}`,
        );
      }
    }
  }

  /** Construye el payload de eventos de Outage a partir de la absence. */
  private buildOutageEvents(absence: Absence): any[] {
    const { timeType, employee_data } = absence;
    const location = employee_data?.multi_location ?? [];

    const base = {
      id: null,
      register: RegisterEnum.OUTAGE,
      reason: absence.requestType,
      location,
      uuid_absence: absence.id,
      uuid_tor: null,
      uuid_extra_hours: null,
      is_paid: false,
      will_make_up_hours: false,
      make_up_schedule: null,
      strict: false,
      notes: absence.comments ?? null,
    };

    if (timeType === AbsenceTimeTypeEnum.Days) {
      const start = moment(absence.startDate, 'YYYY-MM-DD', true);
      const end = moment(absence.endDate, 'YYYY-MM-DD', true);

      if (!start.isValid() || !end.isValid()) {
        throw new Error(`Invalid Days range: ${absence.startDate} → ${absence.endDate}`);
      }

      const totalDays = end.diff(start, 'days') + 1;

      if (totalDays < 1) {
        throw new Error(`endDate is before startDate: ${absence.startDate} → ${absence.endDate}`);
      }

      // Un evento por día natural del rango.
      return Array.from({ length: totalDays }, (_, i) => {
        const date = start.clone().add(i, 'days').format('YYYY-MM-DD');
        return {
          ...base,
          date,
          start: FULL_DAY_START,
          end: FULL_DAY_END,
        };
      });
    }

    // ── Hours ───────────────────────────────────────────────────────────────
    const date = absence.hourDate;
    const startTime = this.hhmm(absence.startTime);

    if (!date || !startTime) {
      throw new Error(`Invalid Hours absence: date=${date} start=${absence.startTime}`);
    }

    const endTime = this.hhmm(absence.endTime);

    // Outage abierto: solo válido para 'No Internet' / 'Power Outage'.
    if (!endTime && !ABSENCE_END_OPTIONAL_REASONS.includes(absence.requestType as any)) {
      throw new Error(`endTime is required for reason "${absence.requestType}"`);
    }

    return [{ ...base, date, start: startTime, end: endTime }];
  }

  /**
   * Normaliza 'HH:mm:ss' → 'HH:mm'.
   * buildTimestamp() de employee_schedule solo acepta HH:mm bare o ISO completo;
   * un 'HH:mm:ss' de una columna `time` le devuelve null silenciosamente.
   */
  private hhmm(value?: string | null): string | null {
    if (!value) return null;
    const trimmed = String(value).trim();
    if (!trimmed) return null;
    const match = trimmed.match(/^(\d{1,2}):(\d{2})/);
    if (!match) return null;
    return `${match[1].padStart(2, '0')}:${match[2]}`;
  }

  /**
   * Borra los eventos de Outage ligados a la absence.
   * Devuelve false si no se pudieron borrar, para que el caller lo deje visible
   * en vez de dar por hecho que el master schedule quedó limpio.
   */
  private async deleteScheduleEvents(absence: Absence): Promise<{ ok: boolean; error?: string }> {
    try {
      const employeeNumber = absence.employee_data?.employee_number;
      if (!employeeNumber) return { ok: false, error: 'Absence has no employee_number' };

      const schedule = await this.employeeScheduleRepo.findOne({
        where: { employee_number: employeeNumber },
      });

      // Sin schedule no hay nada que borrar: es un no-op legítimo, no un fallo.
      if (!schedule) {
        this.logger.warn(`[deleteScheduleEvents] No schedule for ${employeeNumber}, nothing to delete`);
        return { ok: true };
      }

      const result = await this.scheduleEventRepo
        .createQueryBuilder()
        .delete()
        .from(ScheduleEvent)
        .where('"scheduleId" = :scheduleId', { scheduleId: schedule.id })
        .andWhere('uuid_absence = :uuid_absence', { uuid_absence: absence.id })
        .execute();

      this.logger.log(`[deleteScheduleEvents] Removed ${result.affected ?? 0} event(s) for absence ${absence.id}`);
      return { ok: true };
    } catch (err: any) {
      const error = String(err?.message ?? err).slice(0, 1000);
      this.logger.warn(`[deleteScheduleEvents] Failed for ${absence.id} (non-blocking): ${error}`);
      return { ok: false, error };
    }
  }

  /**
   * Reintenta la sincronización con el master schedule cuando
   * event_sync_status = 'Failed'.
   *
   * Registered → reescribe los eventos.
   * Cancelled  → reintenta el borrado (el alta falló al cancelar).
   */
  async retryScheduleEvent(id: string): Promise<Absence> {
    const absence = await this.findOne(id);

    if (absence.status === AbsenceStatusEnum.Cancelled) {
      const removal = await this.deleteScheduleEvents(absence);

      await this.absenceRepo.update(id, {
        event_sync_status: removal.ok ? EventSyncStatusEnum.Synced : EventSyncStatusEnum.Failed,
        event_sync_error: removal.ok
          ? null
          : `Cancelled, but the outage events could not be removed: ${removal.error}`,
      });

      return this.findOne(id);
    }

    // Evita duplicar si un intento anterior sí escribió algo.
    await this.deleteScheduleEvents(absence);
    await this.syncScheduleEvent(absence);

    return this.findOne(id);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // CORREOS
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Notifica el alta de la absence a HR, a los supervisors del empleado y a
   * management. Cada envío es independiente: si uno falla, los otros siguen.
   */
  private async notifyAbsenceCreated(absence: Absence): Promise<void> {
    const formData = this.toEmailDto(absence);

    await Promise.allSettled([
      this.safeSend('hr', () => this.sendHrEmail(formData)),
      this.safeSend('coordinator', () => this.sendCoordinatorEmail(formData)),
      this.safeSend('management', () => this.sendManagementEmail(formData)),
      this.safeSend('staff', () => this.sendStaffEmail(formData)),
    ]);
  }

  private async safeSend(label: string, fn: () => Promise<any>): Promise<void> {
    try {
      const resp = await fn();
      this.logger.log(`[email:${label}] sent — ${JSON.stringify(resp ?? {})}`);
    } catch (err: any) {
      this.logger.warn(`[email:${label}] failed (non-blocking): ${err?.message ?? err}`);
    }
  }

  /** HR — destinatarios por permiso 'hr_absence_template'. */
  private async sendHrEmail(formData: AbsenceSavedDto) {
    const recipientsObjects = await this.getRecipientsByPermission('hr_absence_template');

    if (!recipientsObjects.length) {
      this.logger.warn('[email:hr] No recipients for permission hr_absence_template');
      return { success: true, templateName: 'hr_absence_request', subject: '', total: 0 };
    }

    const dto: SendAbsenceTemplateObjDto = {
      recipientsObjects,
      templateName: 'hr_absence_request',
      subject: this.buildSubject(formData, 'HR'),
      formData,
      actor: 'Staff',
    };

    return this.apiClient.sendHrTemplate(dto);
  }

  /** Management — destinatarios por permiso 'management_absence_template'. */
  private async sendManagementEmail(formData: AbsenceSavedDto) {
    const recipientsObjects = await this.getRecipientsByPermission('management_absence_template');

    if (!recipientsObjects.length) {
      this.logger.warn('[email:management] No recipients for permission management_absence_template');
      return { success: true, templateName: 'management_absence_request', subject: '', total: 0 };
    }

    const dto: SendAbsenceTemplateObjDto = {
      recipientsObjects,
      templateName: 'management_absence_request',
      subject: this.buildSubject(formData, 'Management'),
      formData,
      actor: 'Staff',
    };

    return this.apiClient.sendManagementTemplate(dto);
  }

  /** Supervisors del empleado — resueltos por jerarquía, no por permiso. */
  private async sendCoordinatorEmail(formData: AbsenceSavedDto) {
    const emails = await this.employeeService.getSupervisorsEmailsByEmployeeNumber(
      formData.employee_data.employee_number,
    );

    if (!emails?.length) {
      this.logger.warn(
        `[email:coordinator] No supervisors found for ${formData.employee_data.employee_number}`,
      );
      return { success: true, templateName: 'coordinator_absence_request', subject: '', total: 0 };
    }

    const dto: SendAbsenceTemplateDto = {
      recipients: emails,
      templateName: 'coordinator_absence_request',
      subject: this.buildSubject(formData, 'Coordinator'),
      formData,
      actor: 'Staff',
    };

    return this.apiClient.sendCoordinatorTemplate(dto);
  }

  /** Acuse al propio empleado. */
  private async sendStaffEmail(formData: AbsenceSavedDto) {
    const email = formData.employee_data?.nova_email;

    if (!email) {
      this.logger.warn(
        `[email:staff] No nova_email for ${formData.employee_data.employee_number}`,
      );
      return { success: true, templateName: 'staff_absence_confirmation', subject: '', total: 0 };
    }

    const dto: SendAbsenceTemplateDto = {
      recipients: [email],
      templateName: 'staff_absence_confirmation',
      subject: this.buildSubject(formData, 'Staff'),
      formData,
      actor: 'System',
    };

    return this.apiClient.sendStaffTemplate(dto);
  }

  private buildSubject(formData: AbsenceSavedDto, audience: string): string {
    const who = `${formData.employee_data.name} ${formData.employee_data.last_name}`.trim();
    const when = formData.dateOrRange;
    const cancelled = formData.status === 'Cancelled';
    const verb = cancelled ? 'Absence Cancelled' : 'Absence Registered';
    return `[${audience}] ${verb} — ${who} — ${formData.requestType} — ${when}`;
  }

  /** Serializa la entity al contrato que espera el email_service. */
  private toEmailDto(absence: Absence): AbsenceSavedDto {
    return {
      id: absence.id,
      timeType: absence.timeType as any,
      startDate: absence.startDate ?? null,
      endDate: absence.endDate ?? null,
      hourDate: absence.hourDate ?? null,
      startTime: absence.startTime ?? null,
      endTime: absence.endTime ?? null,
      requestType: absence.requestType,
      comments: absence.comments ?? null,
      dateOrRange: absence.dateOrRange,
      status: absence.status as any,
      employee_data: absence.employee_data,
      cancellation_info: absence.cancellation_info ?? null,
      is_paid: absence.is_paid,
      recovery_required: absence.recovery_required,
      createdDate: absence.createdDate,
      createdTime: absence.createdTime,
    };
  }

  /**
   * Resuelve destinatarios vía el API de permisos de Nova One.
   * Mismo endpoint que usa TOR, con los reintentos de host para entornos
   * Docker/WSL donde 'localhost' no resuelve al contenedor vecino.
   */
  private async getRecipientsByPermission(perm: string): Promise<AbsenceRecipientDto[]> {
    let baseUrl = (process.env.NOVA_ONE_API ?? '').trim();

    if (!baseUrl) {
      this.logger.warn('[perm] NOVA_ONE_API is not configured');
      return [];
    }

    baseUrl = baseUrl.replace(/\/$/, '');
    const path = '/permissions/employee-numbers-by-permission';

    const candidates = [`${baseUrl}${path}`];

    if (/localhost/i.test(baseUrl)) {
      candidates.push(`${baseUrl.replace('localhost', '127.0.0.1')}${path}`);
      candidates.push(`${baseUrl.replace('localhost', 'host.docker.internal')}${path}`);
    }

    for (const url of candidates) {
      try {
        const resp = await axios.get(url, {
          params: { perm },
          timeout: 7000,
          proxy: false,
          validateStatus: () => true,
        });

        if (resp.status !== 200) {
          this.logger.warn(`[perm] ${url} → HTTP ${resp.status}`);
          continue;
        }

        const data: any = resp.data;
        const list = Array.isArray(data?.employee_numbers)
          ? data.employee_numbers
          : Array.isArray(data)
            ? data
            : [];

        if (list.length) return list as AbsenceRecipientDto[];
      } catch (err: any) {
        this.logger.warn(`[perm] ${url} → ${err?.message}`);
      }
    }

    this.logger.warn(`[perm] No recipients resolved for perm="${perm}"`);
    return [];
  }

  // ══════════════════════════════════════════════════════════════════════════
  // READ
  // ══════════════════════════════════════════════════════════════════════════

  async findAll(): Promise<Absence[]> {
    return this.absenceRepo.find({
      order: { createdDate: 'DESC', createdTime: 'DESC' },
    });
  }

  async findOne(id: string): Promise<Absence> {
    const absence = await this.absenceRepo.findOne({ where: { id } });
    if (!absence) throw new NotFoundException(`Absence ID ${id} not found`);
    return absence;
  }

  /** Absences de un empleado, opcionalmente filtradas por estado. */
  async findByEmployee(employeeNumber: string, status?: string): Promise<Absence[]> {
    const query = this.absenceRepo
      .createQueryBuilder('absence')
      .where(`absence.employee_data ->> 'employee_number' = :employeeNumber`, { employeeNumber });

    if (status && status.toLowerCase() !== 'all') {
      query.andWhere('absence.status = :status', { status });
    }

    return query
      .orderBy('absence.createdDate', 'DESC')
      .addOrderBy('absence.createdTime', 'DESC')
      .getMany();
  }

  /** Absences cuya escritura en el master schedule falló. */
  async findFailedSync(): Promise<Absence[]> {
    return this.absenceRepo.find({
      where: { event_sync_status: EventSyncStatusEnum.Failed },
      order: { createdDate: 'DESC' },
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // UPDATE / CANCEL
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Edita una absence activa. Reescribe los eventos de Outage si cambió algo
   * que afecte al calendario.
   */
  async update(id: string, updateDto: UpdateAbsenceDto): Promise<Absence> {
    const absence = await this.findOne(id);

    if (absence.status === AbsenceStatusEnum.Cancelled) {
      throw new BadRequestException('Cannot edit a cancelled absence');
    }

    const merged = { ...absence, ...updateDto } as any;
    this.validateDateCoherence(merged);

    // 'comments' entra aquí porque se copia a schedule_event.notes:
    // sin él, editar solo el comentario dejaría la nota vieja en el evento.
    const scheduleFields: Array<keyof UpdateAbsenceDto> = [
      'timeType',
      'requestType',
      'startDate',
      'endDate',
      'hourDate',
      'startTime',
      'endTime',
      'comments',
    ];

    const scheduleChanged = scheduleFields.some(
      field => updateDto[field] !== undefined && updateDto[field] !== (absence as any)[field],
    );

    await this.absenceRepo.update(id, updateDto as any);
    const updated = await this.findOne(id);

    if (scheduleChanged) {
      await this.deleteScheduleEvents(updated);
      await this.syncScheduleEvent(updated);
      return this.findOne(id);
    }

    return updated;
  }

  /**
   * Borrado duro: elimina los eventos de Outage y el registro.
   * Solo para admin (HR / Management). No deja rastro — a diferencia de
   * cancel(), que conserva el renglón con cancellation_info.
   *
   * A diferencia del resto de operaciones con el schedule, esta NO es
   * "non-blocking": si el evento no se puede borrar, no se borra el registro.
   * Borrar la absence dejando el Outage huérfano en el master schedule sería
   * peor que fallar, porque ya no quedaría el uuid_absence para limpiarlo.
   */
  async remove(id: string): Promise<{ deleted: true; id: string }> {
    const absence = await this.findOne(id);

    const removal = await this.deleteScheduleEvents(absence);

    if (!removal.ok) {
      throw new InternalServerErrorException(
        `Could not remove the outage events from the master schedule: ${removal.error}. The absence was not deleted.`,
      );
    }

    await this.absenceRepo.delete(id);
    this.logger.log(`[remove] Absence ${id} and its outage events deleted`);

    return { deleted: true, id };
  }

  /**
   * Cancela la absence y borra sus eventos de Outage del master schedule.
   */
  async cancel(id: string, dto: CancelAbsenceDto): Promise<Absence> {
    const absence = await this.findOne(id);

    if (absence.status === AbsenceStatusEnum.Cancelled) {
      throw new BadRequestException('Absence is already cancelled');
    }

    const chicagoNow = moment().tz(TZ);

    await this.absenceRepo.update(id, {
      status: AbsenceStatusEnum.Cancelled,
      cancellation_info: {
        cancelled_by: dto.cancelled_by ?? absence.employee_data?.employee_number ?? '',
        role: dto.role ?? 'staff',
        reason: dto.reason,
        date: chicagoNow.format('YYYY-MM-DD'),
        time: chicagoNow.format('HH:mm:ss'),
      },
    });

    const cancelled = await this.findOne(id);

    // Si el Outage no se pudo quitar del master schedule, la absence queda
    // Cancelled pero el calendario sigue bloqueado. Se marca para que sea
    // visible y reintentable, no un warning perdido en los logs.
    const removal = await this.deleteScheduleEvents(cancelled);

    await this.absenceRepo.update(id, {
      event_sync_status: removal.ok ? EventSyncStatusEnum.Synced : EventSyncStatusEnum.Failed,
      event_sync_error: removal.ok
        ? null
        : `Cancelled, but the outage events could not be removed: ${removal.error}`,
    });

    await this.safeSend('staff-cancel', () =>
      this.sendStaffEmail(this.toEmailDto(cancelled)),
    );

    return this.findOne(id);
  }
}

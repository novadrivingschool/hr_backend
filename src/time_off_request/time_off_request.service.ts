import { Injectable, NotFoundException, InternalServerErrorException, Logger, BadRequestException, ServiceUnavailableException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';
import { TimeOffRequest } from './entities/time_off_request.entity';
import { CreateTimeOffRequestDto } from './dto/create-time_off_request.dto';
import { UpdateTimeOffRequestDto } from './dto/update-time_off_request.dto';
import * as moment from 'moment-timezone';
import { CreateTimeOffRequestSavedDto, RecipientDto, SendTimeOffTemplateDto, SendTimeOffTemplateObjDto } from './dto/time-off.dto';
import axios from 'axios';
import { StatusEnum, TimeTypeEnum } from './enums';
import { EmployeesService } from 'src/employees/employees.service';
import { TimeOffApiClient } from './api/time-off.api';
import { EmployeeScheduleService } from 'src/employee_schedule/employee_schedule.service';
import { ScheduleEvent } from 'src/schedule_event/entities/schedule_event.entity';
import { EmployeeSchedule } from 'src/employee_schedule/entities/employee_schedule.entity';
import { RegisterEnum } from 'src/schedule_event/entities/register.enum';
import { pushBellNotification, resolveEmployeeNumbersByRoles } from 'src/common/it-api.client';

interface EmployeeNumbersByPermissionResponse {
  permission: string;
  count: number;
  employee_numbers: string[];
}


@Injectable()
export class TimeOffRequestService {
  private readonly logger = new Logger(TimeOffRequestService.name);
  private readonly apiClient: TimeOffApiClient;

  constructor(
    @InjectRepository(TimeOffRequest)
    private readonly timeOffRequestRepo: Repository<TimeOffRequest>,
    @InjectRepository(ScheduleEvent)
    private readonly scheduleEventRepo: Repository<ScheduleEvent>,
    @InjectRepository(EmployeeSchedule)
    private readonly employeeScheduleRepo: Repository<EmployeeSchedule>,
    private readonly employeeService: EmployeesService,
    private readonly employeeScheduleService: EmployeeScheduleService,
  ) {
    this.apiClient = new TimeOffApiClient();
  }

  /* CREATE NEW TOR */
  async create(createDto: CreateTimeOffRequestDto): Promise<TimeOffRequest> {
    try {
      console.log("createDto: ", createDto);
      const chicagoNow = moment().tz('America/Chicago');
      const request = this.timeOffRequestRepo.create({
        ...createDto,
        status: StatusEnum.Pending,
        createdDate: chicagoNow.format('YYYY-MM-DD'),
        createdTime: chicagoNow.format('HH:mm:ss'),
        coordinator_approval: { approved: false, by: '' },
        hr_approval: { approved: false, by: '' },
      });

      const saved = await this.timeOffRequestRepo.save(request);
      console.log("saved: ", saved);

      // ── Coordinator email + admin bell — fire-and-forget ──────────────────
      // Deliberately NOT awaited: both fan out to other services (email_service,
      // nova-one, it_backend) with up-to-7s timeouts each, and none of their
      // results affect the response. Awaiting them made the employee's
      // "create request" click hang for the sum of every downstream timeout.
      this.sentCoordinatorRequest(saved).catch((emailErr) => {
        this.logger.warn(`[create] Coordinator email failed (non-blocking): ${emailErr?.message}`);
      });
      this.notifyAdminsOfNewRequest(saved).catch((bellErr) => {
        this.logger.warn(`[create] Bell notification failed (non-blocking): ${bellErr?.message}`);
      });

      return saved;

    } catch (error) {
      this.logger.error('Failed to create time off request', error.stack);
      throw new InternalServerErrorException('Error creating time off request');
    }
  }


  async findAll(): Promise<TimeOffRequest[]> {
    try {
      return await this.timeOffRequestRepo.find({
        order: {
          createdDate: 'DESC',
          createdTime: 'DESC',
        },
      });
    } catch (error) {
      this.logger.error('Failed to fetch time off requests', error.stack);
      throw new InternalServerErrorException('Error fetching time off requests');
    }
  }

  async findOne(id: string): Promise<TimeOffRequest> {
    try {
      const request = await this.timeOffRequestRepo.findOne({ where: { id } });
      if (!request) throw new NotFoundException(`Request ID ${id} not found`);
      return request;
    } catch (error) {
      this.logger.error(`Failed to fetch time off request with ID ${id}`, error.stack);
      throw error;
    }
  }

  async update(id: string, updateDto: UpdateTimeOffRequestDto): Promise<TimeOffRequest> {
    try {
      // ── 1. Obtener el request actual ──────────────────────────────────────
      const request = await this.findOne(id);

      if (!request) {
        throw new NotFoundException(`Time-off request with ID ${id} not found`);
      }

      // ── 2. Solo se puede editar si está Pending ───────────────────────────
      //    (La autorización de recuperación de horas se maneja aparte,
      //    vía updateRecoveryAuthorization, sin esta restricción — ver más abajo).
      if (request.status !== StatusEnum.Pending) {
        throw new BadRequestException(
          `Cannot edit a request with status "${request.status}". Only Pending requests can be edited.`,
        );
      }

      // ── 3. Detectar si cambiaron campos que afectan al schedule ───────────
      const scheduleFields: Array<keyof UpdateTimeOffRequestDto> = [
        'timeType', 'hourDate', 'startTime', 'endTime', 'startDate', 'endDate',
      ];

      const scheduleChanged = scheduleFields.some(field => {
        if (updateDto[field] === undefined) return false;
        return String(updateDto[field]) !== String((request as any)[field] ?? '');
      });

      // ── 4. Guardar cambios (status nunca se sobreescribe desde edit) ──────
      const { status: _strippedStatus, ...safeUpdateDto } = updateDto as any;
      const updated = Object.assign(request, safeUpdateDto);
      const saved = await this.timeOffRequestRepo.save(updated);

      // ── 5. Verificar si existen eventos para este TOR en el schedule ──────
      //    Solo tiene sentido si hubo cambios en campos de schedule
      if (scheduleChanged) {
        try {
          // Buscar el schedule del empleado
          const schedule = await this.employeeScheduleRepo.findOne({
            where: { employee_number: saved.employee_data?.employee_number },
          });

          if (schedule) {
            // Contar eventos vinculados a este TOR
            const existingEventsCount = await this.scheduleEventRepo
              .createQueryBuilder('event')
              .where('"scheduleId" = :scheduleId', { scheduleId: schedule.id })
              .andWhere('event.uuid_tor = :uuid_tor', { uuid_tor: id })
              .getCount();

            this.logger.log(
              `[update] TOR ${id} → found ${existingEventsCount} existing event(s) in schedule`,
            );

            if (existingEventsCount > 0) {
              // Existen eventos → borrar y recrear con los nuevos valores
              this.logger.log(`[update] Deleting and recreating ${existingEventsCount} event(s)`);
              await this._deleteScheduleEventsFromTimeOff(saved);
              await this._createScheduleEventsFromTimeOff(saved);
            } else {
              // No existen eventos → no hay nada que tocar
              // (TOR Pending aún no aprobado, o el create original falló y se ignoró)
              this.logger.log(`[update] No existing events for TOR ${id} — skipping schedule sync`);
            }
          } else {
            this.logger.warn(
              `[update] No schedule found for employee ${saved.employee_data?.employee_number} — skipping schedule sync`,
            );
          }
        } catch (syncErr) {
          // Non-blocking: el TOR ya fue guardado correctamente
          this.logger.warn(`[update] Schedule sync failed (non-blocking): ${syncErr?.message}`);
        }
      }

      return saved;

    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }

      this.logger.error(`[update] Failed to update request ID ${id}`, error.stack);
      throw new InternalServerErrorException('Error updating time off request');
    }
  }

  /**
   * Actualiza únicamente recovery_required (hrs autorizadas).
   * Sin restricción de status: HR/Management puede autorizar o desautorizar
   * la recuperación de horas en cualquier momento, incluso con el TOR ya
   * Approved/Not Approved — a diferencia de update(), que solo aplica a Pending.
   */
  async updateRecoveryAuthorization(id: string, recovery_required: boolean): Promise<TimeOffRequest> {
    try {
      const request = await this.findOne(id);

      if (!request) {
        throw new NotFoundException(`Time-off request with ID ${id} not found`);
      }

      request.recovery_required = recovery_required === true;
      return await this.timeOffRequestRepo.save(request);
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }

      this.logger.error(`[updateRecoveryAuthorization] Failed for request ID ${id}`, error.stack);
      throw new InternalServerErrorException('Error updating hour recovery authorization');
    }
  }

  async remove(id: string): Promise<void> {
    try {
      const request = await this.findOne(id);
      await this.timeOffRequestRepo.remove(request);
    } catch (error) {
      this.logger.error(`Failed to remove request ID ${id}`, error.stack);
      throw new InternalServerErrorException('Error removing time off request');
    }
  }

  async searchByEmployeeAndStatus(employeeNumber: string, status?: string): Promise<TimeOffRequest[]> {
    try {
      const query = this.timeOffRequestRepo
        .createQueryBuilder('request')
        .where(`request.employee_data::jsonb ->> 'employee_number' = :employeeNumber`, { employeeNumber });

      if (status && status !== 'All') {
        query.andWhere('request.status = :status', { status });
      }

      return await query
        .orderBy('request.createdDate', 'DESC')
        .addOrderBy('request.createdTime', 'DESC')
        .getMany();
    } catch (error) {
      this.logger.error(`Failed to search requests for employee ${employeeNumber}`, error.stack);
      throw new InternalServerErrorException('Error searching time off requests');
    }
  }

  async searchCoordinatorByEmployeeAndStatus(employeeNumber: string, status?: string): Promise<TimeOffRequest[]> {
    try {
      const query = this.timeOffRequestRepo
        .createQueryBuilder('request')
        .where(`request.employee_data::jsonb ->> 'employee_number' = :employeeNumber`, { employeeNumber });

      // Lógica por status
      if (status === 'Pending') {
        query.andWhere(`request.status = 'Pending'`)
          .andWhere(`request.coordinator_approval ->> 'approved' = 'false'`);
      } else if (status === 'Approved') {
        query.andWhere(`request.status = 'Pending'`)
          .andWhere(`request.coordinator_approval ->> 'approved' = 'true'`);
      } else if (status === 'Not Approved') {
        query.andWhere(`request.status = 'Not Approved'`)
          .andWhere(`request.coordinator_approval ->> 'approved' = 'false'`);
      }
      // status === 'All' => no agregar nada

      return await query
        .orderBy('request.createdDate', 'DESC')
        .addOrderBy('request.createdTime', 'DESC')
        .getMany();
    } catch (error) {
      throw new InternalServerErrorException('Error searching time off requests');
    }
  }


  async updateStatus(id: string, status: StatusEnum): Promise<TimeOffRequest> {
    try {
      const request = await this.findOne(id);
      request.status = status;
      return await this.timeOffRequestRepo.save(request);
    } catch (error) {
      this.logger.error(`Failed to update status for request ID ${id}`, error.stack);
      throw new InternalServerErrorException('Error updating status');
    }
  }

  async approveByCoordinator(
    id: string,
    approved: boolean,
    by: string,
    coordinator_comments: string,
  ): Promise<{ message: string; data: TimeOffRequest }> {
    try {
      console.log('---------------------------------');
      console.log('Approving by COORDINATOR');
      console.log('id:', id);
      console.log('approved:', approved);
      console.log('coordinator_comments:', coordinator_comments);
      console.log('---------------------------------');

      const request = await this.findOne(id);
      if (!request) throw new NotFoundException(`Time-off request with ID ${id} not found`);

      const chicagoNow = moment().tz('America/Chicago');

      // ── Stage 1 ────────────────────────────────────────────────────
      request.coordinator_approval = {
        approved,
        by,
        date: chicagoNow.format('YYYY-MM-DD'),
        time: chicagoNow.format('HH:mm:ss'),
      };
      request.coordinator_comments = coordinator_comments;

      if (approved) {
        // ✅ Coordinator aprueba Stage 1 → TOR sigue Pending, espera HR (Stage 2)
        // hr_approval NO se toca — sigue { approved: false, by: '' }
      } else {
        // ❌ Coordinator rechaza → cierra AMBOS stages → TOR = Not Approved
        request.hr_approval = {
          approved: false,
          by,
          date: chicagoNow.format('YYYY-MM-DD'),
          time: chicagoNow.format('HH:mm:ss'),
        };
        request.hr_comments = `Not approved by Coordinator: ${by}`;
        request.status = StatusEnum.NotApproved;
      }

      const updatedRequest = await this.timeOffRequestRepo.save(request);
      console.log('updatedRequest:', updatedRequest);

      // ── Notificaciones ─────────────────────────────────────────────
      // Si aprobó Stage 1 → avisa a HR para que pasen al Stage 2
      if (approved) {
        try {
          await this.sendHrEmail(updatedRequest);
        } catch (err) {
          this.logger.warn(`[approveByCoordinator] HR email failed (non-blocking): ${err?.message}`);
        }
      }

      // Siempre avisa a Management (jerarquía mayor)
      try {
        await this.sendManagementEmail(updatedRequest);
      } catch (err) {
        this.logger.warn(`[approveByCoordinator] Management email failed (non-blocking): ${err?.message}`);
      }

      // Bell: ONE shared notification to HR + Management, only on approval —
      // it's their turn to act. On rejection the coordinator is the first
      // filter and the request is already final: notifying HR/Management
      // would just be noise about something they never need to touch. The
      // requester still hears about it either way, via notifyEmployeeOfDecision below.
      if (approved) {
        try {
          await this.notifyRolesOfStageDecision(updatedRequest, ['hr', 'management'], 'coordinator', true);
        } catch (err) {
          this.logger.warn(`[approveByCoordinator] HR/Management bell notification failed (non-blocking): ${err?.message}`);
        }
      }

      // Siempre avisa al Staff
      try {
        await this.apiClient.sendStaffTemplate({
          templateName: 'time_off_staff_notification',
          formData: { ...updatedRequest },
          actor: 'Coordinator',
        });
      } catch (err) {
        this.logger.warn(`[approveByCoordinator] Staff notification failed (non-blocking): ${err?.message}`);
      }

      // Bell notification to the requester — non-blocking, same trigger as the email above.
      try {
        await this.notifyEmployeeOfDecision(updatedRequest, 'coordinator', approved);
      } catch (err) {
        this.logger.warn(`[approveByCoordinator] Employee bell notification failed (non-blocking): ${err?.message}`);
      }

      return {
        message: `Time-off request ${approved ? 'approved (Stage 1 — awaiting HR)' : 'rejected'} by ${by}`,
        data: updatedRequest,
      };

    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      throw new InternalServerErrorException('An error occurred while approving the request by coordinator');
    }
  }

  /* SEND EMAIL TO HR TIME OFF REQUEST */
  async sendHrEmail(updatedRequest: CreateTimeOffRequestSavedDto) {
    const recipientsObjects: RecipientDto[] = await this.getEmployeeNumbersByPermission('hr_time_off_template');
    console.log("recipientsObjects: ", recipientsObjects);

    if (recipientsObjects.length === 0) {
      console.warn('⚠️ No HR recipientsObjects found for permission: hr_time_off_template');
      return { success: true, templateName: 'timeoff_hr_template', subject: '', total: 0 };
    }

    // 2) Arma el DTO que espera el Email Service
    const subject = ``;

    const dto: SendTimeOffTemplateObjDto = {
      recipientsObjects,                         // <-- string[]
      templateName: 'hr_time_off_request',
      subject,
      formData: updatedRequest
    };

    // 3) Envía usando el API client
    try {
      // Asegúrate de tener this.apiClient instanciado (por constructor o DI)
      const resp = await this.apiClient.sendHRTemplate(dto);
      console.log('✅ HR email service response:', resp);
      return resp;
    } catch (err: any) {
      console.error('❌ Error sending HR template:', err?.message ?? err);
      throw err;
    }

  }

  async approveByHR(
    id: string,
    approved: boolean,
    by: string,
    hr_comments: string,
    is_paid?: boolean,
    recovery_required?: boolean,
  ): Promise<TimeOffRequest> {
    try {

      const request = await this.findOne(id);

      // 🔒 Idempotencia: evita doble aprobación concurrente (doble click / doble
      // submit) que dispararía _createScheduleEventsFromTimeOff() dos veces y
      // duplicaría los eventos en el master schedule. Una vez que HR ya resolvió
      // (Approved o Not Approved), un segundo request para el mismo id se rechaza.
      if (
        request.status === StatusEnum.Approved ||
        request.status === StatusEnum.NotApproved
      ) {
        throw new ConflictException(
          `Time-off request ${id} was already resolved by HR (status: ${request.status}).`,
        );
      }

      const chicagoNow = moment().tz('America/Chicago');

      // ✅ Solo sobreescribe Stage 1 si AÚN NO fue aprobado por coordinator
      // Si coordinator ya actuó → respeta su historial (nombre, fecha, comentarios)
      if (!request.coordinator_approval?.approved) {
        request.coordinator_approval = {
          approved,
          by,
          date: chicagoNow.format('YYYY-MM-DD'),
          time: chicagoNow.format('HH:mm:ss'),
        };
        request.coordinator_comments = hr_comments;
      }

      // ✅ Siempre setea Stage 2 (HR/Management/SuperCoordinator)
      request.hr_approval = {
        approved,
        by,
        date: chicagoNow.format('YYYY-MM-DD'),
        time: chicagoNow.format('HH:mm:ss'),
      };
      request.hr_comments = hr_comments;

      request.status = approved ? StatusEnum.Approved : StatusEnum.NotApproved;

      // ── HR/Management setea autorización al aprobar ─────────────────────────
      if (approved) {
        if (is_paid !== undefined) request.is_paid = is_paid;
        if (recovery_required !== undefined) request.recovery_required = recovery_required;
      }

      const updatedRequest = await this.timeOffRequestRepo.save(request);

      // ✅ Si fue aprobado → crear eventos en el schedule
      if (approved) {
        await this._createScheduleEventsFromTimeOff(updatedRequest);
      }

      console.log("<<<<<<<<<<<<<<<<<<<<")
      console.log(JSON.stringify(updatedRequest, null, 2))

      // Siempre avisa a Management
      try {
        await this.sendManagementEmail(updatedRequest);
      } catch (err) {
        this.logger.warn(`[approveByHR] Management email failed (non-blocking): ${err?.message}`);
      }

      // Bell: Management + the requester's own supervisors get the final
      // outcome, whether approved or not — this is the flow closing, so both
      // "who manages the department" (role) and "who manages this specific
      // person" (per-employee supervisor) need to know. HR is excluded on
      // purpose: it just acted, notifying itself would be noise.
      try {
        const recipients = await this.resolveAdminAndSupervisorRecipients(
          updatedRequest.employee_data?.employee_number,
          'approveByHR',
          ['management'],
        );
        await this.notifyStageDecisionRecipients(updatedRequest, recipients, 'hr', approved);
      } catch (err) {
        this.logger.warn(`[approveByHR] Management/supervisor bell notification failed (non-blocking): ${err?.message}`);
      }

      // Siempre avisa al Staff
      try {
        await this.apiClient.sendStaffTemplate({
          templateName: 'time_off_staff_notification',
          formData: { ...updatedRequest },
          actor: 'HR',
        });
      } catch (err) {
        this.logger.warn(`[approveByHR] Staff notification failed (non-blocking): ${err?.message}`);
      }

      // Bell notification to the requester — non-blocking, same trigger as the email above.
      try {
        await this.notifyEmployeeOfDecision(updatedRequest, 'hr', approved);
      } catch (err) {
        this.logger.warn(`[approveByHR] Employee bell notification failed (non-blocking): ${err?.message}`);
      }

      return updatedRequest;

    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof ConflictException
      ) {
        throw error;
      }

      this.logger.error(`HR approval failed for request ID ${id}`, error.stack);
      throw new InternalServerErrorException('Error approving by HR');
    }
  }

  /* SEND EMAIL TO MANAGEMENT TIME OFF REQUEST */
  async sendManagementEmail(updatedRequest: CreateTimeOffRequestSavedDto) {
    console.log("---------------- sendManagementEmail ----------------");
    const recipientsObjects: RecipientDto[] = await this.getEmployeeNumbersByPermission('management_time_off_template');
    console.log("recipientsObjects: ", recipientsObjects);

    if (recipientsObjects.length === 0) {
      console.warn('⚠️ No Management recipientsObjects found for permission: management_time_off_template');
      return { success: true, templateName: 'management_time_off_template', subject: '', total: 0 };
    }

    // 2) Arma el DTO que espera el Email Service
    const subject = ``;

    const dto: SendTimeOffTemplateObjDto = {
      recipientsObjects,                         // <-- string[]
      templateName: 'management_time_off_request',
      subject,
      formData: updatedRequest
    };

    // 3) Envía usando el API client
    try {
      // Asegúrate de tener this.apiClient instanciado (por constructor o DI)
      const resp = await this.apiClient.sendManagementTemplate(dto);
      console.log('✅ Management email service response:', resp);
      return resp;
    } catch (err: any) {
      console.error('❌ Error sending Management template:', err?.message ?? err);
      throw err;
    }

  }

  /* async findByStatus(status: string): Promise<TimeOffRequest[]> {
    if (status.toLowerCase() === 'all') {
      return this.timeOffRequestRepo.find();
    }

    return this.timeOffRequestRepo.find({
      where: { status: this.normalizeStatus(status) },
    });
  } */
  async findByStatus(status: string): Promise<TimeOffRequest[]> {
    const s = (status ?? '').trim().toLowerCase();
    if (s === 'all') return this.timeOffRequestRepo.find();

    // normalización inline (sin función extra)
    const normalized: StatusEnum =
      s === 'approved'
        ? StatusEnum.Approved
        : s === 'not approved' || s === 'not_approved' || s === 'notapproved'
          ? StatusEnum.NotApproved
          : StatusEnum.Pending;

    return this.timeOffRequestRepo.find({ where: { status: normalized } });
  }

  /**
   * Retorna todos los TORs con status=Pending clasificados por su stage actual.
   * - stage 'coordinator': coordinator_approval.approved = false → reminder a coordinators del department
   * - stage 'hr':          coordinator_approval.approved = true AND hr_approval.approved = false → reminder a HR
   * Usado por el cron TIME_OFF_REMINDER del automation-service.
   */
  async findPendingForAutomation(): Promise<{ id: string; stage: 'coordinator' | 'hr'; multi_department: string[] }[]> {
    try {
      const requests = await this.timeOffRequestRepo
        .createQueryBuilder('request')
        .select(['request.id', 'request.employee_data', 'request.coordinator_approval', 'request.hr_approval'])
        .where('request.status = :status', { status: StatusEnum.Pending })
        .getMany();

      return requests
        .map((r) => {
          const coordApproved = r.coordinator_approval?.approved === true;
          const hrApproved    = r.hr_approval?.approved === true;

          if (!coordApproved) {
            return { id: r.id, stage: 'coordinator' as const, multi_department: r.employee_data?.multi_department ?? [] };
          }
          if (coordApproved && !hrApproved) {
            return { id: r.id, stage: 'hr' as const, multi_department: r.employee_data?.multi_department ?? [] };
          }
          return null;
        })
        .filter((r): r is NonNullable<typeof r> => r !== null);
    } catch (error) {
      this.logger.error('Error en findPendingForAutomation:', error);
      throw new InternalServerErrorException('Error al buscar TORs pendientes para automation');
    }
  }

  private normalizeStatus(input: string): string {
    // Normaliza el texto (puedes expandir esto si hace falta)
    switch (input.toLowerCase()) {
      case 'pending':
        return 'Pending';
      case 'approved':
        return 'Approved';
      case 'not approved':
        return 'Not Approved';
      default:
        return 'Pending'; // fallback por seguridad
    }
  }

  async findCoordinatorByStatusAndDepartment(
    status: string,
    department: string
  ): Promise<TimeOffRequest[]> {
    console.log("<< Fetching requests by status and department:", status, department);

    const query = this.timeOffRequestRepo.createQueryBuilder('request');

    const whereClauses: string[] = [];
    const params: Record<string, any> = {};

    // Departamento (solo si no es 'All')
    if (department !== 'All') {
      whereClauses.push(`request.employee_data ->> 'department' = :department`);
      params.department = department;
    }

    // Lógica por status
    if (status === 'Pending') {
      whereClauses.push(`request.status = 'Pending'`);
      whereClauses.push(`request.coordinator_approval ->> 'approved' = 'false'`);
    } else if (status === 'Approved') {
      whereClauses.push(`request.status = 'Pending'`);
      whereClauses.push(`request.coordinator_approval ->> 'approved' = 'true'`);
    } else if (status === 'Not Approved') {
      whereClauses.push(`request.status = 'Not Approved'`);
      whereClauses.push(`request.coordinator_approval ->> 'approved' = 'false'`);
    }

    if (whereClauses.length > 0) {
      query.where(whereClauses.join(' AND '), params);
    }

    // 👇 Ordenar por fecha y hora descendente (más reciente primero)
    query.orderBy(`request.createdDate`, 'DESC')
      .addOrderBy(`request.createdTime`, 'DESC');

    return await query.getMany();
  }

  /* async findHrByStatusDepartmentAndEmployee(
    status: string,
    department: string,
    employee_number?: string
  ): Promise<TimeOffRequest[]> {
    console.log("<< Fetching requests:", { status, department, employee_number });

    const query = this.timeOffRequestRepo.createQueryBuilder('request');

    // 🔷 Departamento
    if (department !== 'All') {
      query.andWhere(`request.employee_data ->> 'department' = :department`, { department });
    }

    // 🔷 Employee Number (opcional)
    if (employee_number) {
      query.andWhere(`request.employee_data ->> 'employee_number' = :employee_number`, { employee_number });
    }

    // 🔷 Lógica por status
    const normalizedStatus = status.toLowerCase();

    if (normalizedStatus === 'pending') {
      query.andWhere(`request.status = 'Pending'`)
        .andWhere(`request.hr_approval ->> 'approved' = 'false'`)
        .andWhere(`(request.coordinator_approval ->> 'approved' = 'true' OR request.coordinator_approval ->> 'approved' = 'false')`);
    } else if (normalizedStatus === 'approved') {
      query.andWhere(`request.hr_approval ->> 'approved' = 'true'`)
        .andWhere(`request.coordinator_approval ->> 'approved' = 'true'`);
    } else if (normalizedStatus === 'not approved') {
      query.andWhere(`request.status = 'Not Approved'`)
        .andWhere(`request.hr_approval ->> 'approved' = 'false'`);
    }

    return query.getMany();
  } */
  async findHrByStatusDepartmentAndEmployee(
    status: string,
    multi_department: string[] = [],
    employee_number?: string,
    search?: string,
    dateFrom?: string,
    dateTo?: string,
  ): Promise<TimeOffRequest[]> {
    const query = this.timeOffRequestRepo.createQueryBuilder('request');

    const depts = multi_department.map(d => d.trim()).filter(Boolean);
    const shouldFilterByDept = depts.length > 0;

    if (shouldFilterByDept) {
      query.andWhere(new Brackets(sqb => {
        depts.forEach((d, i) => {
          sqb.orWhere(`(request.employee_data -> 'multi_department') @> :dept${i}`, {
            [`dept${i}`]: JSON.stringify([d]),
          });
        });
      }));
    }

    if (employee_number) {
      query.andWhere(`request.employee_data ->> 'employee_number' = :employee_number`, { employee_number });
    }

    // 🔍 Búsqueda parcial (live search): nombre, apellido, nombre completo o employee_number
    if (search) {
      query.andWhere(new Brackets(sqb => {
        sqb.orWhere(
          `(request.employee_data ->> 'name') || ' ' || (request.employee_data ->> 'last_name') ILIKE :search`,
          { search: `%${search}%` },
        );
        sqb.orWhere(`request.employee_data ->> 'employee_number' ILIKE :search`, { search: `%${search}%` });
      }));
    }

    // 📅 Rango sobre las fechas SOLICITADAS (no createdDate), con solapamiento:
    //  - Hours: hourDate dentro del rango
    //  - Days:  [startDate, endDate] se solapa con [dateFrom, dateTo]
    if (dateFrom || dateTo) {
      const from = dateFrom ?? dateTo;
      const to = dateTo ?? dateFrom;
      query.andWhere(new Brackets(sqb => {
        sqb.orWhere(
          `(request."hourDate" IS NOT NULL AND request."hourDate" >= :dateFrom AND request."hourDate" <= :dateTo)`,
        );
        sqb.orWhere(
          `(request."startDate" IS NOT NULL AND request."startDate" <= :dateTo AND COALESCE(request."endDate", request."startDate") >= :dateFrom)`,
        );
      }));
      query.setParameters({ dateFrom: from, dateTo: to });
    }

    const s = status?.toLowerCase?.() ?? '';
    if (s === 'pending') {
      query
        .andWhere(`request.status = 'Pending'`)
        .andWhere(`request.hr_approval ->> 'approved' = 'false'`)
        .andWhere(`(request.coordinator_approval ->> 'approved' = 'true' OR request.coordinator_approval ->> 'approved' = 'false')`);
    } else if (s === 'approved') {
      query
        .andWhere(`request.hr_approval ->> 'approved' = 'true'`)
        .andWhere(`request.coordinator_approval ->> 'approved' = 'true'`);
    } else if (s === 'not approved') {
      query
        .andWhere(`request.status = 'Not Approved'`)
        .andWhere(`request.hr_approval ->> 'approved' = 'false'`);
    } else if (s === 'cancelled') {     // ✅ caso nuevo
      query.andWhere(`request.status = 'Cancelled'`);
    }

    return query.getMany();
  }

  /* FIND COORDINATOR EMAIL BY DEPARTMENT */
  async sentCoordinatorRequest(payload: CreateTimeOffRequestSavedDto) {/*  */
    console.log("---------------- sentCoordinatorRequest ----------------");
    console.log("payload: ", payload);

    const departments = payload.employee_data.multi_department

    /*  const coordinatorEmails = await this.employeeService.findCoordinatorsEmailsByDepartments({
       departments
     }) */

    /* GET SUPERVISORS EMAIL */
    const coordinatorEmails = await this.employeeService.getSupervisorsEmailsByEmployeeNumber(payload.employee_data.employee_number);

    console.log("coordinatorEmails: ", coordinatorEmails);

    if (coordinatorEmails.length === 0) {
      console.warn('⚠️ No coordinators found for departments:', departments);
      return;
    }

    // construyes el DTO para enviar al microservicio de email
    const dto = {
      recipients: coordinatorEmails,
      templateName: '',
      formData: payload, // 👈 aquí mandas todo el payload como formData
      subject: ``,
    };

    console.log("dto: ", dto);

    console.log("---------------------------------");

    try {
      /* SENDING TO STAFF NOTIFICATION */
      dto.templateName = 'staff_submitted_time_off_request'
      const respStaff = await this.apiClient.sendStaffSubmittedTorTemplate(dto);
      console.log('✅ Email/Staff service response:', respStaff);

      /* SENDING TO COORDINATOR NOTIFICATION */
      dto.templateName = 'coordinator_time_off_request'
      const resp = await this.apiClient.sendCoordinatorTemplate(dto);
      console.log('✅ Email/Coordinator service response:', resp);
      return resp;
    } catch (err) {
      console.error('❌ Error sending coordinator template:', err.message);
      throw err;
    }
  }

  /**
   * Pushes a "new time off request" event to the generic admin navbar bell
   * (it_backend `/notifications`). Recipients are:
   *  - HR + Management (per role, resolved live via nova-one-backend), AND
   *  - the requester's own supervisors/coordinators — same local
   *    `employees.supervisors` column already used by sentCoordinatorRequest()
   *    to email them, above. This is why "fulano" in IT still reaches his own
   *    supervisors even though they're not globally "hr"/"management": their
   *    relationship is per-employee, not per-department.
   * This is a snapshot at creation time, independent of the email flow above.
   */
  /**
   * Shared recipient set for TOR events that must reach role-based staff PLUS
   * the requester's own supervisors (per-employee relationship, independent
   * of global roles). `roles` defaults to `['hr', 'management']` (creation),
   * but the final HR/Management decision below narrows it to `['management']`
   * only — HR just acted, notifying itself would be noise.
   */
  private async resolveAdminAndSupervisorRecipients(
    requesterEmployeeNumber: string | undefined,
    context: string,
    roles: string[] = ['hr', 'management'],
  ): Promise<string[]> {
    const [roleRecipients, supervisorNumbers] = await Promise.all([
      resolveEmployeeNumbersByRoles(roles),
      requesterEmployeeNumber
        ? this.employeeService
            .getSupervisorEmployeeNumbersByEmployeeNumber(requesterEmployeeNumber)
            .catch((err) => {
              this.logger.warn(`[${context}] could not resolve supervisors: ${err?.message}`);
              return [] as string[];
            })
        : Promise.resolve([] as string[]),
    ]);

    const recipients = [...new Set([...roleRecipients, ...supervisorNumbers])];
    this.logger.log(
      `[${context}] roles=${roleRecipients.length} supervisors=${supervisorNumbers.length} total=${recipients.length} recipient(s): ${JSON.stringify(recipients)}`,
    );
    return recipients;
  }

  private async notifyAdminsOfNewRequest(saved: TimeOffRequest): Promise<void> {
    this.logger.log(`[notifyAdminsOfNewRequest] START for TOR ${saved.id} — IT_API_URL=${process.env.IT_API_URL || '(unset)'} NOVA_ONE_API=${process.env.NOVA_ONE_API || '(unset)'}`);

    const recipients = await this.resolveAdminAndSupervisorRecipients(
      saved.employee_data?.employee_number,
      'notifyAdminsOfNewRequest',
    );

    if (recipients.length === 0) {
      this.logger.warn(
        '[notifyAdminsOfNewRequest] no hr/management employee and no supervisor resolved for this requester — skipping bell notification. ' +
        'Check the employee\'s `supervisors` column in hr_backend and GET/POST NOVA_ONE_API/employees/filter with {"status":"Active","permissions":"hr"|"management"}.',
      );
      return;
    }

    const requester = `${saved.employee_data?.name ?? ''} ${saved.employee_data?.last_name ?? ''}`.trim()
      || saved.employee_data?.employee_number
      || 'An employee';

    await pushBellNotification({
      category: 'time_off_request',
      type: 'created',
      title: 'New Time Off Request',
      message: `${requester} requested ${saved.requestType} (${saved.dateOrRange})`,
      // El id va embebido en el link, no sólo en `source_id`: mismo patrón
      // que car_inspection (go-nova-api). Cuando este módulo se abra en
      // Nova One 2.0, la vista admin sólo tiene que leer `?request=` — no
      // hace falta tocar hr_backend otra vez. Cubre a HR, Management y a
      // los supervisores del solicitante (coordinator vía relación directa,
      // no por rol): los tres son destinatarios de ESTA misma notificación.
      link: `/time-off-request-admin?request=${saved.id}`,
      source_id: saved.id,
      recipients,
    });

    this.logger.log(`[notifyAdminsOfNewRequest] DONE — bell notification pushed to it_backend for TOR ${saved.id}`);
  }

  /**
   * Bell notifications for cancel/reopen — the bell previously only covered
   * created + decisions, so an admin could act on a request that no longer
   * existed if they only followed the bell. Recipients mirror the created
   * event (hr + management + the requester's supervisors); on cancellation
   * by an admin role, the requester is notified too (their self-cancel needs
   * no notification — they just did it themselves).
   */
  private async notifyAdminsOfLifecycleEvent(
    updated: TimeOffRequest,
    event: 'cancelled' | 'reopened',
    actor: string,
  ): Promise<void> {
    const recipients = await this.resolveAdminAndSupervisorRecipients(
      updated.employee_data?.employee_number,
      `notifyAdminsOfLifecycleEvent:${event}`,
    );
    if (recipients.length === 0) {
      this.logger.warn(`[notifyAdminsOfLifecycleEvent] no recipients for TOR ${updated.id} event=${event} — skipping`);
      return;
    }

    const requester = `${updated.employee_data?.name ?? ''} ${updated.employee_data?.last_name ?? ''}`.trim()
      || updated.employee_data?.employee_number
      || 'An employee';

    await pushBellNotification({
      category: 'time_off_request',
      type: event,
      title: event === 'cancelled' ? 'Time Off Request Cancelled' : 'Time Off Request Reopened',
      message: event === 'cancelled'
        ? `${requester}'s ${updated.requestType} request (${updated.dateOrRange}) was cancelled by ${actor}.`
        : `${requester}'s ${updated.requestType} request (${updated.dateOrRange}) was reopened by ${actor} and is pending approval again.`,
      // Ver nota en notifyAdminsOfNewRequest: mismo id embebido, misma
      // audiencia (HR + Management + supervisores del solicitante).
      link: `/time-off-request-admin?request=${updated.id}`,
      source_id: updated.id,
      recipients,
    });
  }

  /**
   * Tells the REQUESTER their request was cancelled by an admin (hr /
   * management / coordinator). Mirrors the staff email already sent at the
   * same point.
   */
  private async notifyEmployeeOfCancellation(
    updated: TimeOffRequest,
    actor: string,
  ): Promise<void> {
    const employeeNumber = updated.employee_data?.employee_number;
    if (!employeeNumber) return;

    await pushBellNotification({
      category: 'time_off_request',
      type: 'cancelled',
      title: 'Time Off Request Cancelled',
      message: `Your ${updated.requestType} request (${updated.dateOrRange}) was cancelled by ${actor}.`,
      // Vista del empleado: mismo patrón, id embebido para abrir esta
      // solicitud puntual en vez de la lista genérica.
      link: `/time-off-request?request=${updated.id}`,
      source_id: updated.id,
      recipients: [employeeNumber],
    });
  }

  /**
   * Pushes a bell notification to HR and/or Management about a decision
   * made on someone else's TOR — mirrors exactly the same "who needs to
   * know" logic already encoded in sendHrEmail/sendManagementEmail:
   *  - HR is only notified when the coordinator approved (Stage 1 done,
   *    it's now HR's turn to close the flow) — never on rejection, since
   *    a coordinator rejection is already final and there's nothing left
   *    for HR to act on.
   *  - Management is notified on every decision, at both stages, regardless
   *    of outcome — same as their email, which always fires.
   * Callers pass which role(s) to notify for a given call; recipients are
   * resolved live (role-based, not a per-employee snapshot like supervisors).
   *
   * Thin wrapper around `notifyStageDecisionRecipients`: resolves recipients
   * by role only. The coordinator stage uses this — no supervisors, since
   * they were already notified at creation and don't need a second ping for
   * the same request moving one stage forward.
   */
  private async notifyRolesOfStageDecision(
    updated: TimeOffRequest,
    roles: string[],
    stage: 'coordinator' | 'hr',
    approved: boolean,
  ): Promise<void> {
    const recipients = await resolveEmployeeNumbersByRoles(roles);
    await this.notifyStageDecisionRecipients(updated, recipients, stage, approved);
  }

  /**
   * Builds and sends the "stage decision" bell to an already-resolved
   * recipient list. Split out from `notifyRolesOfStageDecision` so the final
   * HR/Management decision can notify supervisors too — a set that mixes a
   * global role (management) with a per-employee relationship (supervisors),
   * which `resolveEmployeeNumbersByRoles` alone can't produce.
   */
  private async notifyStageDecisionRecipients(
    updated: TimeOffRequest,
    recipients: string[],
    stage: 'coordinator' | 'hr',
    approved: boolean,
  ): Promise<void> {
    if (recipients.length === 0) {
      this.logger.warn(`[notifyStageDecisionRecipients] no recipients for stage=${stage} approved=${approved} — skipping`);
      return;
    }

    const requester = `${updated.employee_data?.name ?? ''} ${updated.employee_data?.last_name ?? ''}`.trim()
      || updated.employee_data?.employee_number
      || 'An employee';

    // Report the actual person who acted (already stored in
    // coordinator_approval.by / hr_approval.by) instead of a role label
    // like "HR" or "Management" — someone can hold both roles (or be a
    // supervisor too), so their name is the only thing that's always
    // accurate, regardless of which "hat" they used to click approve.
    const actorName = (stage === 'coordinator' ? updated.coordinator_approval?.by : updated.hr_approval?.by)
      || (stage === 'coordinator' ? 'the coordinator' : 'HR/Management');

    let title: string;
    let message: string;

    if (stage === 'coordinator') {
      // Sólo se llega aquí en aprobación: un rechazo del coordinator es
      // final y no le queda nada por hacer a HR/Management, así que
      // `approveByCoordinator` ni siquiera llama a esta función en ese caso.
      title = 'Time Off Request Awaiting HR Approval';
      message = `${requester}'s ${updated.requestType} request (${updated.dateOrRange}) was approved by ${actorName} and now needs HR/Management approval.`;
    } else {
      title = approved ? 'Time Off Request Approved' : 'Time Off Request Not Approved';
      message = `${requester}'s ${updated.requestType} request (${updated.dateOrRange}) was ${approved ? 'approved' : 'not approved'} by ${actorName}.`;
    }

    await pushBellNotification({
      category: 'time_off_request',
      type: `${stage}_${approved ? 'approved' : 'rejected'}_notice`,
      title,
      message,
      // Cubre tanto el aviso al aprobar el coordinator (hr+management) como
      // el aviso final de hr/management (management+supervisors) — las dos
      // llamadas pasan por aquí. Mismo id embebido que el resto de esta clase.
      link: `/time-off-request-admin?request=${updated.id}`,
      source_id: updated.id,
      recipients,
    });
  }

  /**
   * Pushes a bell notification to the REQUESTER when a decision is made on
   * their TOR — one notification per real decision taken:
   *  - coordinator approves  → status stays Pending (awaiting HR)
   *  - coordinator rejects   → final, both stages close at once
   *  - hr/management decides → final (approves or rejects), whether or not
   *    a coordinator ever acted (if HR covers that stage, this fires once)
   * Mirrors the existing best-effort "staff email" notification already
   * sent at both of these points — same trigger points, same non-blocking
   * behavior, just to the in-app bell instead of email.
   */
  private async notifyEmployeeOfDecision(
    updated: TimeOffRequest,
    stage: 'coordinator' | 'hr',
    approved: boolean,
  ): Promise<void> {
    const employeeNumber = updated.employee_data?.employee_number;
    if (!employeeNumber) {
      this.logger.warn('[notifyEmployeeOfDecision] request has no employee_number — skipping');
      return;
    }

    // Same reasoning as notifyRolesOfStageDecision: report the actual
    // approver's name (already stored on the request) instead of a role
    // label, since that person may hold hr/management/supervisor at once.
    const actorName = (stage === 'coordinator' ? updated.coordinator_approval?.by : updated.hr_approval?.by)
      || (stage === 'coordinator' ? 'your coordinator' : 'HR/Management');

    let title: string;
    let message: string;

    if (stage === 'coordinator') {
      title = approved ? 'Time Off Request Approved by Coordinator' : 'Time Off Request Not Approved';
      message = approved
        ? `Your ${updated.requestType} request (${updated.dateOrRange}) was approved by ${actorName}. Awaiting final approval from HR.`
        : `Your ${updated.requestType} request (${updated.dateOrRange}) was not approved by ${actorName}.`;
    } else {
      title = approved ? 'Time Off Request Approved' : 'Time Off Request Not Approved';
      message = approved
        ? `Your ${updated.requestType} request (${updated.dateOrRange}) has been fully approved by ${actorName}.`
        : `Your ${updated.requestType} request (${updated.dateOrRange}) was not approved by ${actorName}.`;
    }

    await pushBellNotification({
      category: 'time_off_request',
      type: `${stage}_${approved ? 'approved' : 'rejected'}`,
      title,
      message,
      link: `/time-off-request?request=${updated.id}`,
      source_id: updated.id,
      recipients: [employeeNumber],
    });
  }

  async getEmployeeNumbersByPermission(perm: string): Promise<any[]> {
    const t0 = Date.now();
    const p = (perm ?? '').trim();

    console.log(`[perm] init :: perm="${p}"`);

    if (!p) {
      console.warn('[perm] missing "perm"');
      throw new BadRequestException('Query param "perm" es requerido');
    }

    let baseUrl = (process.env.NOVA_ONE_API ?? '').trim(); // ej: http://localhost:5001
    console.log(`[perm] baseUrl="${baseUrl}"`);
    if (!baseUrl) throw new BadRequestException('NOVA_ONE_API no está configurado.');
    baseUrl = baseUrl.replace(/\/$/, '');

    const path = '/permissions/employee-numbers-by-permission';
    const url = `${baseUrl}${path}`;
    console.log(`[perm] url="${url}"`);

    try {
      // Primer intento
      const resp = await axios.get<EmployeeNumbersByPermissionResponse>(url, {
        params: { perm: p },
        timeout: 7000,
        proxy: false,
        validateStatus: () => true, // logear aunque no sea 200
      });

      console.log(`[perm] HTTP ${resp.status} :: ${Date.now() - t0}ms`);
      try {
        console.log('[perm] data preview:', JSON.stringify(resp.data).slice(0, 400));
      } catch {
        console.log('[perm] data preview: [unserializable]');
      }

      if (resp.status >= 500) {
        console.warn(`[perm] upstream >=500: ${resp.status}`);
        throw new ServiceUnavailableException(`Upstream error ${resp.status}`);
      }
      if (resp.status >= 400) {
        console.warn(`[perm] upstream >=400: ${resp.status}`);
        throw new BadRequestException(`Upstream returned ${resp.status}: ${JSON.stringify(resp.data)}`);
      }

      let nums: string[] = [];

      // Formas aceptadas
      if (Array.isArray((resp.data as any)?.employee_numbers)) {
        nums = (resp.data as any).employee_numbers;
      } else if (Array.isArray(resp.data)) {
        nums = resp.data as unknown as string[];
      } else {
        console.warn('[perm] unexpected shape:', JSON.stringify(resp.data).slice(0, 400));
        throw new InternalServerErrorException('Unexpected response shape');
      }

      // Reintentos típicos si viene vacío y es localhost (Docker/WSL)
      if (nums.length === 0 && /localhost/i.test(baseUrl)) {
        const altUrl127 = url.replace('localhost', '127.0.0.1');
        console.warn(`[perm] empty result; retry -> ${altUrl127}`);
        const alt127 = await axios.get<EmployeeNumbersByPermissionResponse>(altUrl127, {
          params: { perm: p },
          timeout: 5000,
          proxy: false,
          validateStatus: () => true,
        });
        console.log(`[perm] alt(127) HTTP ${alt127.status}`);
        if (alt127.status === 200 && Array.isArray(alt127.data?.employee_numbers)) {
          nums = alt127.data.employee_numbers;
        } else if (alt127.status !== 200) {
          throw new BadRequestException(`Alt(127) returned ${alt127.status}: ${JSON.stringify(alt127.data)}`);
        }

        if (nums.length === 0) {
          const altHost = url.replace('localhost', 'host.docker.internal');
          console.warn(`[perm] still empty; retry -> ${altHost}`);
          const altH = await axios.get<EmployeeNumbersByPermissionResponse>(altHost, {
            params: { perm: p },
            timeout: 5000,
            proxy: false,
            validateStatus: () => true,
          });
          console.log(`[perm] alt(host) HTTP ${altH.status}`);
          if (altH.status === 200 && Array.isArray(altH.data?.employee_numbers)) {
            nums = altH.data.employee_numbers;
          } else if (altH.status !== 200) {
            throw new BadRequestException(`Alt(host) returned ${altH.status}: ${JSON.stringify(altH.data)}`);
          }
        }
      }

      console.log(`[perm] done :: items=${nums.length} :: ${Date.now() - t0}ms`);
      return nums;
    } catch (e: any) {
      if (e?.isAxiosError) {
        console.error('[perm] axios error :: code=', e.code, 'msg=', e.message, 'elapsed=', Date.now() - t0, 'ms');
        if (e.response) {
          try {
            console.error('[perm] axios response :: status=', e.response.status, 'data=', JSON.stringify(e.response.data).slice(0, 800));
          } catch {
            console.error('[perm] axios response :: status=', e.response.status, 'data=[unserializable]');
          }
        } else if (e.request) {
          console.error('[perm] axios request :: no response (timeout/DNS/ECONNREFUSED?)');
        }
      } else {
        console.error('[perm] error ::', e?.message || e);
        if (e?.stack) console.error(e.stack);
      }

      if (
        e instanceof BadRequestException ||
        e instanceof InternalServerErrorException ||
        e instanceof ServiceUnavailableException
      ) {
        throw e;
      }
      throw new InternalServerErrorException(e?.message || 'Unknown error');
    }
  }

  // Reemplaza el método cancelRequest existente
  async cancelRequest(
    id: string,
    cancelled_by: string,
    role: 'staff' | 'hr' | 'coordinator' | 'management',
    reason?: string,
  ): Promise<{ message: string; data: TimeOffRequest }> {
    try {
      console.log('🟥 [cancelRequest] START');
      console.log(
        '🟥 [cancelRequest] incoming:',
        JSON.stringify({ id, cancelled_by, role, reason }, null, 2),
      );

      const request = await this.findOne(id);

      console.log(
        '🟥 [cancelRequest] request found:',
        JSON.stringify(
          {
            id: request.id,
            status: request.status,
            employee_number: request.employee_data?.employee_number,
            hr_approval: request.hr_approval,
            coordinator_approval: request.coordinator_approval,
          },
          null,
          2,
        ),
      );

      const cancellableStatuses: StatusEnum[] = [
        StatusEnum.Pending,
        StatusEnum.Approved,
      ];

      if (!cancellableStatuses.includes(request.status)) {
        throw new BadRequestException(
          `Cannot cancel a request with status "${request.status}". Only Pending or Approved requests can be cancelled.`,
        );
      }

      const wasApproved = request.status === StatusEnum.Approved;
      console.log('🟥 [cancelRequest] wasApproved:', wasApproved);

      const chicagoNow = moment().tz('America/Chicago');

      request.status = StatusEnum.Cancelled;
      request.cancellation_info = {
        cancelled_by,
        role,
        reason: reason ?? '',
        date: chicagoNow.format('YYYY-MM-DD'),
        time: chicagoNow.format('HH:mm:ss'),
      };

      const updated = await this.timeOffRequestRepo.save(request);

      console.log(
        '🟥 [cancelRequest] request updated:',
        JSON.stringify(
          {
            id: updated.id,
            status: updated.status,
            cancellation_info: updated.cancellation_info,
          },
          null,
          2,
        ),
      );

      // Solo si ANTES estaba Approved, se borran eventos del schedule
      if (wasApproved) {
        console.log(
          `🧩 [cancelRequest] TOR ${id} was approved, deleting schedule events and recovery hours...`,
        );

        await this._deleteScheduleEventsFromTimeOff(updated);

        console.log(
          `✅ [cancelRequest] schedule events deleted for TOR ${id}`,
        );
      } else {
        console.log(
          `ℹ️ [cancelRequest] TOR ${id} was not approved yet, no schedule events to delete`,
        );
      }

      try {
        await this.apiClient.sendStaffTemplate({
          templateName: 'time_off_staff_notification',
          formData: { ...updated },
          actor:
            role === 'hr'
              ? 'HR'
              : role === 'management'
                ? 'Management'
                : role === 'coordinator'
                  ? 'Coordinator'
                  : 'System',
        });
      } catch (err) {
        this.logger.warn(
          `[cancelRequest] Cancel notification failed for request ${id}: ${err?.message}`,
        );
      }

      // ── Bell notifications — fire-and-forget, mirrors the email above ────
      const cancelActor = cancelled_by || role || 'System';
      this.notifyAdminsOfLifecycleEvent(updated, 'cancelled', cancelActor).catch((err) => {
        this.logger.warn(`[cancelRequest] Admin bell notification failed (non-blocking): ${err?.message}`);
      });
      if (['hr', 'management', 'coordinator'].includes((role || '').toLowerCase())) {
        // Cancelled on the employee's behalf — let them know via the bell too.
        this.notifyEmployeeOfCancellation(updated, cancelActor).catch((err) => {
          this.logger.warn(`[cancelRequest] Employee bell notification failed (non-blocking): ${err?.message}`);
        });
      }

      console.log('🏁 [cancelRequest] END');

      return {
        message: `Time-off request cancelled by ${cancelled_by} (${role})`,
        data: updated,
      };
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }

      this.logger.error(`[cancelRequest] Failed for request ID ${id}`, error.stack);
      throw new InternalServerErrorException('Error cancelling time off request');
    }
  }

  // ✅ NUEVO método reopenRequest
  async reopenRequest(
    id: string,
    reopened_by: string,
  ): Promise<{ message: string; data: TimeOffRequest }> {
    const request = await this.findOne(id);

    const reopenableStatuses: StatusEnum[] = [StatusEnum.NotApproved, StatusEnum.Cancelled];
    if (!reopenableStatuses.includes(request.status)) {
      throw new BadRequestException(
        `Cannot reopen a request with status "${request.status}". Only Not Approved or Cancelled requests can be reopened.`,
      );
    }

    const chicagoNow = moment().tz('America/Chicago');

    request.status = StatusEnum.Pending;
    request.coordinator_approval = { approved: false, by: '', date: '', time: '' };
    request.hr_approval = { approved: false, by: '', date: '', time: '' };
    request.coordinator_comments = '';   // ✅ string vacío en lugar de null
    request.hr_comments = '';   // ✅ string vacío en lugar de null
    request.cancellation_info = null; // este sí acepta null según la entity

    const updated = await this.timeOffRequestRepo.save(request);

    try {
      await this.sentCoordinatorRequest(updated as any);
    } catch (err) {
      this.logger.warn(`Reopen coordinator notification failed for request ${id}: ${err?.message}`);
    }

    // ── Bell notification — fire-and-forget, mirrors the email above ──────
    this.notifyAdminsOfLifecycleEvent(updated, 'reopened', reopened_by || 'System').catch((err) => {
      this.logger.warn(`[reopenRequest] Bell notification failed (non-blocking): ${err?.message}`);
    });

    return {
      message: `Time-off request reopened by ${reopened_by}`,
      data: updated,
    };
  }

  async getKpiCounts(multi_department: string[] = []): Promise<{
    pendingCoordinator: number;
    pendingHR: number;
    approved: number;
    notApproved: number;
    cancelled: number;
    total: number;
  }> {
    const base = this.timeOffRequestRepo.createQueryBuilder('request');

    // Filtro de departamento si aplica
    const applyDeptFilter = (qb: typeof base) => {
      const depts = multi_department.map(d => d.trim()).filter(Boolean);
      if (depts.length > 0) {
        qb.andWhere(new Brackets(sqb => {
          depts.forEach((d, i) => {
            sqb.orWhere(`(request.employee_data -> 'multi_department') @> :dept${i}`, {
              [`dept${i}`]: JSON.stringify([d]),
            });
          });
        }));
      }
      return qb;
    };

    // Pending Coordinator: status=Pending AND coordinator_approval.approved=false
    const pendingCoordinator = await applyDeptFilter(
      this.timeOffRequestRepo.createQueryBuilder('request')
        .andWhere(`request.status = 'Pending'`)
        .andWhere(`request.coordinator_approval ->> 'approved' = 'false'`)
    ).getCount();

    // Pending HR: status=Pending AND coordinator_approval.approved=true AND hr_approval.approved=false
    const pendingHR = await applyDeptFilter(
      this.timeOffRequestRepo.createQueryBuilder('request')
        .andWhere(`request.status = 'Pending'`)
        .andWhere(`request.coordinator_approval ->> 'approved' = 'true'`)
        .andWhere(`request.hr_approval ->> 'approved' = 'false'`)
    ).getCount();

    // Approved
    const approved = await applyDeptFilter(
      this.timeOffRequestRepo.createQueryBuilder('request')
        .andWhere(`request.status = 'Approved'`)
    ).getCount();

    // Not Approved
    const notApproved = await applyDeptFilter(
      this.timeOffRequestRepo.createQueryBuilder('request')
        .andWhere(`request.status = 'Not Approved'`)
    ).getCount();

    // Cancelled
    const cancelled = await applyDeptFilter(
      this.timeOffRequestRepo.createQueryBuilder('request')
        .andWhere(`request.status = 'Cancelled'`)
    ).getCount();

    const total = pendingCoordinator + pendingHR + approved + notApproved + cancelled;

    return { pendingCoordinator, pendingHR, approved, notApproved, cancelled, total };
  }

  async resendStaffEmail(id: string): Promise<{ message: string }> {
    try {
      const request = await this.findOne(id);
      await this.apiClient.sendStaffTemplate({
        templateName: 'time_off_staff_notification',
        formData: { ...request } as any,
        actor: 'System',
      });
      return { message: `Staff email resent for TOR ${id}` };
    } catch (error) {
      this.logger.error(`[resendStaffEmail] Failed for TOR ${id}`, error.stack);
      throw new InternalServerErrorException('Error resending staff email');
    }
  }

  private async _createScheduleEventsFromTimeOff(request: TimeOffRequest): Promise<void> {
    try {
      console.log('🟦 [_createScheduleEventsFromTimeOff] START');
      console.log(
        '🟦 [_createScheduleEventsFromTimeOff] request summary:',
        JSON.stringify(
          {
            id: request?.id,
            timeType: request?.timeType,
            recovery_required: request?.recovery_required,
            recovery_schedule: request?.recovery_schedule,
            is_paid: request?.is_paid,
            hourDate: request?.hourDate,
            startTime: request?.startTime,
            endTime: request?.endTime,
            startDate: request?.startDate,
            endDate: request?.endDate,
            employee_number: request?.employee_data?.employee_number,
            multi_location: request?.employee_data?.multi_location,
          },
          null,
          2,
        ),
      );

      const { timeType, employee_data } = request;
      const employeeNumber = employee_data?.employee_number;

      if (!employeeNumber) {
        console.log('❌ [_createScheduleEventsFromTimeOff] No employee_number found, skipping');
        return;
      }

      const normalizedRecoverySchedule = Array.isArray(request.recovery_schedule)
        ? request.recovery_schedule
          .map((item, index) => {
            if (!item?.date || !item?.startTime || !item?.endTime) {
              console.log(
                `❌ [_createScheduleEventsFromTimeOff] invalid recovery slot #${index + 1}:`,
                JSON.stringify(item, null, 2),
              );
              return null;
            }

            const startUTC = moment
              .tz(
                `${item.date} ${String(item.startTime).substring(0, 5)}`,
                'YYYY-MM-DD HH:mm',
                'America/Chicago',
              )
              .utc()
              .format('YYYY-MM-DDTHH:mm:ss');

            const endUTC = moment
              .tz(
                `${item.date} ${String(item.endTime).substring(0, 5)}`,
                'YYYY-MM-DD HH:mm',
                'America/Chicago',
              )
              .utc()
              .format('YYYY-MM-DDTHH:mm:ss');

            const normalized = {
              date: item.date,
              start: startUTC,
              end: endUTC,
              location: employee_data?.multi_location ?? [],
              strict: false,
              notes: null,
            };

            console.log(
              `🟨 [_createScheduleEventsFromTimeOff] normalized recovery slot #${index + 1}:`,
              JSON.stringify(
                {
                  raw: item,
                  normalized,
                },
                null,
                2,
              ),
            );

            return normalized;
          })
          .filter((item): item is {
            date: string;
            start: string;
            end: string;
            location: string[];
            strict: boolean;
            notes: null;
          } => item !== null)
        : [];

      console.log(
        '🟨 [_createScheduleEventsFromTimeOff] normalizedRecoverySchedule.length:',
        normalizedRecoverySchedule.length,
      );

      const events: Array<{
        id: null;
        date: string;
        start: string;
        end: string;
        register: RegisterEnum;
        location: string[];
        uuid_tor: string;
        is_paid: boolean;
        will_make_up_hours: boolean;
        make_up_schedule: Array<{
          date: string;
          start: string;
          end: string;
          location: string[];
          strict: boolean;
          notes: string | null;
        }>;
        strict: boolean;
      }> = [];

      if (timeType === TimeTypeEnum.Days) {
        const { startDate, endDate } = request;
        const start = moment(startDate, 'YYYY-MM-DD');
        const end = moment(endDate, 'YYYY-MM-DD');

        console.log('🟦 [_createScheduleEventsFromTimeOff] DAYS branch');
        console.log('🟦 [_createScheduleEventsFromTimeOff] parsed start valid:', start.isValid(), 'value:', startDate);
        console.log('🟦 [_createScheduleEventsFromTimeOff] parsed end valid:', end.isValid(), 'value:', endDate);

        if (!start.isValid() || !end.isValid()) {
          console.log('❌ [_createScheduleEventsFromTimeOff] Invalid dates (Days), skipping');
          return;
        }

        const totalDays = end.diff(start, 'days') + 1;
        console.log('🟦 [_createScheduleEventsFromTimeOff] totalDays:', totalDays);

        for (let i = 0; i < totalDays; i++) {
          const day = start.clone().add(i, 'days');
          const dateStr = day.format('YYYY-MM-DD');

          const startUTC = moment
            .tz(`${dateStr} 09:00`, 'YYYY-MM-DD HH:mm', 'America/Chicago')
            .utc()
            .format('YYYY-MM-DDTHH:mm:ss');

          const endUTC = moment
            .tz(`${dateStr} 18:00`, 'YYYY-MM-DD HH:mm', 'America/Chicago')
            .utc()
            .format('YYYY-MM-DDTHH:mm:ss');

          const event = {
            id: null,
            date: dateStr,
            start: startUTC,
            end: endUTC,
            register: RegisterEnum.TIME_OFF_REQUEST,
            location: employee_data?.multi_location ?? [],
            uuid_tor: request.id,
            is_paid: request.is_paid ?? false,
            will_make_up_hours: request.recovery_required ?? false,
            make_up_schedule: normalizedRecoverySchedule,
            strict: false,
          };

          console.log(
            `🟩 [_createScheduleEventsFromTimeOff] parent DAYS event #${i + 1}:`,
            JSON.stringify(event, null, 2),
          );

          events.push(event);
        }
      } else if (timeType === TimeTypeEnum.Hours) {
        const { hourDate, startTime, endTime } = request;

        console.log('🟦 [_createScheduleEventsFromTimeOff] HOURS branch');
        console.log(
          '🟦 [_createScheduleEventsFromTimeOff] raw hour inputs:',
          JSON.stringify({ hourDate, startTime, endTime }, null, 2),
        );

        if (!hourDate || !startTime || !endTime) {
          console.log('❌ [_createScheduleEventsFromTimeOff] Missing hourDate/startTime/endTime (Hours), skipping');
          return;
        }

        const dateStr = moment(hourDate, 'YYYY-MM-DD').format('YYYY-MM-DD');

        const startUTC = moment
          .tz(`${dateStr} ${startTime.substring(0, 5)}`, 'YYYY-MM-DD HH:mm', 'America/Chicago')
          .utc()
          .format('YYYY-MM-DDTHH:mm:ss');

        const endUTC = moment
          .tz(`${dateStr} ${endTime.substring(0, 5)}`, 'YYYY-MM-DD HH:mm', 'America/Chicago')
          .utc()
          .format('YYYY-MM-DDTHH:mm:ss');

        const event = {
          id: null,
          date: dateStr,
          start: startUTC,
          end: endUTC,
          register: RegisterEnum.TIME_OFF_REQUEST,
          location: employee_data?.multi_location ?? [],
          uuid_tor: request.id,
          is_paid: request.is_paid ?? false,
          will_make_up_hours: request.recovery_required ?? false,
          make_up_schedule: normalizedRecoverySchedule,
          strict: false,
        };

        console.log(
          '🟩 [_createScheduleEventsFromTimeOff] parent HOURS event:',
          JSON.stringify(event, null, 2),
        );

        events.push(event);
      } else {
        console.log(`❌ [_createScheduleEventsFromTimeOff] Unknown timeType: ${timeType}, skipping`);
        return;
      }

      if (!events.length) {
        console.log('❌ [_createScheduleEventsFromTimeOff] No events to create, skipping');
        return;
      }

      const payload = {
        employee_number: employeeNumber,
        fixed: [],
        events,
      };

      console.log(
        '📦 [_createScheduleEventsFromTimeOff] payload to employeeScheduleService.create:',
        JSON.stringify(payload, null, 2),
      );

      await this.employeeScheduleService.create(payload as any);

      console.log(`✅ [_createScheduleEventsFromTimeOff] Done for ${employeeNumber}`);
    } catch (err) {
      console.log('❌ [_createScheduleEventsFromTimeOff] ERROR MESSAGE:', err?.message);
      console.log('❌ [_createScheduleEventsFromTimeOff] ERROR STACK:', err?.stack);
      this.logger.warn(`[_createScheduleEventsFromTimeOff] Failed (non-blocking): ${err?.message}`);
    }
  }


  private async _deleteScheduleEventsFromTimeOff(request: TimeOffRequest): Promise<void> {
    try {
      const employeeNumber = request.employee_data?.employee_number;

      if (!employeeNumber) {
        this.logger.warn('[_deleteScheduleEventsFromTimeOff] No employee_number found, skipping');
        return;
      }

      const schedule = await this.employeeScheduleRepo.findOne({
        where: { employee_number: employeeNumber },
      });

      if (!schedule) {
        this.logger.warn(`[_deleteScheduleEventsFromTimeOff] No schedule found for ${employeeNumber}, skipping`);
        return;
      }

      // ── Borra directo por uuid_tor — no importa timeType ni fechas ───────────
      const result = await this.scheduleEventRepo
        .createQueryBuilder()
        .delete()
        .from(ScheduleEvent)
        .where('"scheduleId" = :scheduleId', { scheduleId: schedule.id })
        .andWhere('uuid_tor = :uuid_tor', { uuid_tor: request.id })
        .execute();

      this.logger.log(
        `[_deleteScheduleEventsFromTimeOff] ✅ Deleted ${result.affected} event(s) for ${employeeNumber} | uuid_tor: ${request.id}`
      );

    } catch (err) {
      this.logger.warn(`[_deleteScheduleEventsFromTimeOff] Failed (non-blocking): ${err?.message}`);
    }
  }

}

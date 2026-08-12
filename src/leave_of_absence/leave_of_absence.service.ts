import { randomUUID } from 'crypto';
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { emptyDepartmentLogs, LeaveOfAbsence, LoaActor } from './entities/leave-of-absence.entity';
import { CreateLeaveOfAbsenceDto } from './dto/create-leave-of-absence.dto';
import { UpdateLeaveOfAbsenceDto } from './dto/update-leave-of-absence.dto';
import { AddDepartmentLogEntryDto } from './dto/add-department-log-entry.dto';
import { SetDepartmentAttendedDto } from './dto/set-department-attended.dto';
import { SetDepartmentReactivatedDto } from './dto/set-department-reactivated.dto';
import { MarkReturnedToWorkDto } from './dto/mark-returned-to-work.dto';
import { LOA_DEPARTMENTS, LoaDepartmentEnum, LoaLogPhaseEnum } from './enums';
import { deleteLoaS3File } from '../common/aws-services.client';
import { LoaEmailApiClient } from './api/loa-email.api';
import { LoaEmailFormDataDto, LoaEmailRecipientDto } from './dto/loa-email.dto';
import {
    LOA_DEPARTMENT_DISABLE_ACTIONS,
    LOA_DEPARTMENT_ENABLE_ACTIONS,
    LOA_DEPARTMENT_LABELS,
    LOA_GENERIC_ENABLE_NOTICE,
} from './constants/department-actions';
import { EmployeesV2Service } from '../employees/employees-v2.service';

@Injectable()
export class LeaveOfAbsenceService {
    private readonly logger = new Logger(LeaveOfAbsenceService.name);
    private readonly emailApi: LoaEmailApiClient;

    constructor(
        @InjectRepository(LeaveOfAbsence)
        private readonly repo: Repository<LeaveOfAbsence>,
        private readonly employeesV2Service: EmployeesV2Service,
    ) {
        this.emailApi = new LoaEmailApiClient();
    }

    /**
     * Guarda el registro y dispara los correos de creación — non-blocking
     * (ver notifyCreated): un fallo de email_service nunca debe impedir
     * crear el LOA.
     */
    async create(dto: CreateLeaveOfAbsenceDto): Promise<LeaveOfAbsence> {
        const entity = this.repo.create({
            ...dto,
            registeredInInspirity: dto.registeredInInspirity ?? false,
            wellnessPackages: dto.wellnessPackages ?? false,
            department_logs: emptyDepartmentLogs(),
        });
        const saved = await this.repo.save(entity);
        await this.notifyCreated(saved);
        return saved;
    }

    // ── Correos — non-blocking, nunca deben tumbar la transacción principal ────
    // Mismo criterio que hr_backend/src/absence/absence.service.ts: cada envío
    // va envuelto en safeSend (try/catch + log) y en Promise.allSettled cuando
    // hay varios en paralelo.

    private async safeSend(label: string, fn: () => Promise<{ total?: number }>): Promise<void> {
        try {
            const res = await fn();
            this.logger.log(`[email:${label}] sent to ${res?.total ?? 0} recipient(s)`);
        } catch (err: any) {
            this.logger.warn(`[email:${label}] failed (non-blocking): ${err?.message || err}`);
        }
    }

    /** findByRoles ya filtra status='Active' y trae nova_email — descartamos los que no tengan correo. */
    private async recipientsForRoles(roles: string[]): Promise<LoaEmailRecipientDto[]> {
        try {
            const employees = await this.employeesV2Service.findByRoles(roles);
            return employees
                .filter((e) => e.nova_email)
                .map((e) => ({
                    employee_number: e.employee_number,
                    name: e.name,
                    last_name: e.last_name,
                    nova_email: e.nova_email,
                }));
        } catch (err: any) {
            this.logger.warn(`[email] Failed to resolve recipients for roles [${roles.join(',')}]: ${err?.message || err}`);
            return [];
        }
    }

    private submitterRecipient(found: LeaveOfAbsence): LoaEmailRecipientDto[] {
        const actor = found.created_by;
        if (!actor?.nova_email) return [];
        return [{
            employee_number: actor.employee_number,
            name: actor.name,
            last_name: actor.last_name,
            nova_email: actor.nova_email,
        }];
    }

    private actorFullName(actor: LoaActor | null | undefined): string {
        return `${actor?.name ?? ''} ${actor?.last_name ?? ''}`.trim();
    }

    /**
     * Quien EJECUTA la acción siempre recibe confirmación de lo que hizo —
     * explícito, no depende de que recipientsForRoles(['loa-hr']) lo
     * encuentre (podría no matchear si su roster de roles/status en la
     * tabla employees está desalineado). El dedupe por email en
     * email_service hace que sumarlo aquí sea inofensivo si ya venía
     * incluido por otra vía (rol, submitter).
     */
    private actorRecipient(actor: LoaActor | null | undefined): LoaEmailRecipientDto[] {
        if (!actor?.nova_email) return [];
        return [{
            employee_number: actor.employee_number,
            name: actor.name,
            last_name: actor.last_name,
            nova_email: actor.nova_email,
        }];
    }

    private actionItemsHtml(items: string[]): string {
        return items.map((i) => `<li>${i}</li>`).join('');
    }

    private baseEmailFormData(found: LeaveOfAbsence, extra: Partial<LoaEmailFormDataDto> = {}): LoaEmailFormDataDto {
        return {
            id: found.id,
            loaType: found.loaType,
            startDate: found.startDate,
            endDate: found.endDate,
            returnDate: found.returnDate,
            notes: found.notes,
            submitterName: this.actorFullName(found.created_by),
            submittedAt: found.createdAt
                ? found.createdAt.toLocaleString('en-US', {
                    timeZone: 'America/Chicago',
                    year: 'numeric', month: 'short', day: '2-digit', hour: 'numeric', minute: '2-digit',
                })
                : undefined,
            employee_data: {
                name: found.employee_data?.name ?? '',
                last_name: found.employee_data?.last_name ?? '',
                employee_number: found.employee_number,
                nova_email: found.employee_data?.nova_email,
            },
            ...extra,
        };
    }

    /** Creación: al submitter (confirmación) + a cada depto por separado (sus propias acciones de desactivación). */
    private async notifyCreated(found: LeaveOfAbsence): Promise<void> {
        const sends: Promise<void>[] = [];

        const submitter = this.submitterRecipient(found);
        if (submitter.length) {
            sends.push(this.safeSend('loa:created:submitter', () =>
                this.emailApi.sendTemplate({
                    recipientsObjects: submitter,
                    templateName: 'loa_created_submitter',
                    formData: this.baseEmailFormData(found),
                    actor: 'System',
                }),
            ));
        }

        for (const dept of LOA_DEPARTMENTS) {
            sends.push(this.safeSend(`loa:created:${dept}`, async () => {
                const recipients = await this.recipientsForRoles([`loa-${dept}`]);
                if (!recipients.length) return { total: 0 };
                return this.emailApi.sendTemplate({
                    recipientsObjects: recipients,
                    templateName: 'loa_created_department',
                    formData: this.baseEmailFormData(found, {
                        departmentLabel: LOA_DEPARTMENT_LABELS[dept],
                        actionItems: this.actionItemsHtml(LOA_DEPARTMENT_DISABLE_ACTIONS[dept]),
                    }),
                    actor: 'System',
                });
            }));
        }

        await Promise.allSettled(sends);
    }

    /**
     * Un depto marcó "attended": le llega a TODO loa-hr (puede haber varios) + a quien lo
     * marcó (actorRecipient — si ese actor ya es loa-hr, el dedupe de email_service evita el
     * duplicado). El submitter NO recibe esto — solo se le notifica en la creación.
     */
    private async notifyDepartmentAttended(found: LeaveOfAbsence, department: LoaDepartmentEnum, actor: LoaActor): Promise<void> {
        const recipients = [
            ...(await this.recipientsForRoles(['loa-hr'])),
            ...this.actorRecipient(actor),
        ];
        if (!recipients.length) return;
        await this.safeSend(`loa:attended:${department}`, () =>
            this.emailApi.sendTemplate({
                recipientsObjects: recipients,
                templateName: 'loa_department_attended',
                formData: this.baseEmailFormData(found, {
                    departmentLabel: LOA_DEPARTMENT_LABELS[department],
                    actorName: this.actorFullName(actor),
                }),
                actor: 'Department',
            }),
        );
    }

    /** Un depto marcó "reactivated": mismo destino que attended — todo loa-hr + quien lo marcó. */
    private async notifyDepartmentReactivated(found: LeaveOfAbsence, department: LoaDepartmentEnum, actor: LoaActor): Promise<void> {
        const recipients = [
            ...(await this.recipientsForRoles(['loa-hr'])),
            ...this.actorRecipient(actor),
        ];
        if (!recipients.length) return;
        await this.safeSend(`loa:reactivated:${department}`, () =>
            this.emailApi.sendTemplate({
                recipientsObjects: recipients,
                templateName: 'loa_department_reactivated',
                formData: this.baseEmailFormData(found, {
                    departmentLabel: LOA_DEPARTMENT_LABELS[department],
                    actorName: this.actorFullName(actor),
                }),
                actor: 'Department',
            }),
        );
    }

    /**
     * HR marcó/desmarcó returned_to_work. El submitter NO recibe esto — solo se le
     * notifica en la creación (a menos que también sea el actor de esta acción).
     * - true (regreso confirmado): a cada depto por separado (sus acciones de reactivación) +
     *   un aviso genérico combinado a TODO loa-hr (puede haber varios) + quien lo marcó.
     * - false (undo): un solo correo combinado a los 5 deptos + TODO loa-hr + quien lo marcó,
     *   sin desglose por depto — es una reversión informativa, no una nueva tarea por depto.
     */
    private async notifyReturnedToWork(found: LeaveOfAbsence, isReturning: boolean, actor: LoaActor): Promise<void> {
        const actorName = this.actorFullName(actor);

        if (!isReturning) {
            const recipients = [
                ...(await this.recipientsForRoles(LOA_DEPARTMENTS.map((d) => `loa-${d}`))),
                ...(await this.recipientsForRoles(['loa-hr'])),
                ...this.actorRecipient(actor),
            ];
            if (!recipients.length) return;
            await this.safeSend('loa:returned_to_work:undo', () =>
                this.emailApi.sendTemplate({
                    recipientsObjects: recipients,
                    templateName: 'loa_returned_to_work_undo',
                    formData: this.baseEmailFormData(found, { actorName }),
                    actor: 'HR',
                }),
            );
            return;
        }

        const sends: Promise<void>[] = [];

        for (const dept of LOA_DEPARTMENTS) {
            sends.push(this.safeSend(`loa:returned_to_work:${dept}`, async () => {
                const recipients = await this.recipientsForRoles([`loa-${dept}`]);
                if (!recipients.length) return { total: 0 };
                return this.emailApi.sendTemplate({
                    recipientsObjects: recipients,
                    templateName: 'loa_returned_to_work',
                    formData: this.baseEmailFormData(found, {
                        departmentLabel: LOA_DEPARTMENT_LABELS[dept],
                        actionItems: this.actionItemsHtml(LOA_DEPARTMENT_ENABLE_ACTIONS[dept]),
                        actorName,
                    }),
                    actor: 'HR',
                });
            }));
        }

        const hrRecipients = [
            ...(await this.recipientsForRoles(['loa-hr'])),
            ...this.actorRecipient(actor),
        ];
        if (hrRecipients.length) {
            sends.push(this.safeSend('loa:returned_to_work:hr', () =>
                this.emailApi.sendTemplate({
                    recipientsObjects: hrRecipients,
                    templateName: 'loa_returned_to_work',
                    formData: this.baseEmailFormData(found, {
                        departmentLabel: 'All departments',
                        actionItems: this.actionItemsHtml(LOA_GENERIC_ENABLE_NOTICE),
                        actorName,
                    }),
                    actor: 'HR',
                }),
            ));
        }

        await Promise.allSettled(sends);
    }

    async findAll(): Promise<LeaveOfAbsence[]> {
        const rows = await this.repo.find({ order: { createdAt: 'DESC' } });
        // Mismo backfill defensivo que findOne: filas creadas antes de la
        // migración de bitácoras pueden traer department_logs = '{}'.
        rows.forEach((row) => {
            if (!row.department_logs || Object.keys(row.department_logs).length === 0) {
                row.department_logs = emptyDepartmentLogs();
            }
        });
        return rows;
    }

    async findOne(id: string): Promise<LeaveOfAbsence> {
        const found = await this.repo.findOne({ where: { id } });
        if (!found) {
            throw new NotFoundException(`LeaveOfAbsence ${id} not found`);
        }
        // Registros creados antes de esta migración pueden no traer department_logs sembrado.
        if (!found.department_logs || Object.keys(found.department_logs).length === 0) {
            found.department_logs = emptyDepartmentLogs();
        }
        return found;
    }

    async update(id: string, dto: UpdateLeaveOfAbsenceDto): Promise<LeaveOfAbsence> {
        const found = await this.findOne(id);
        Object.assign(found, dto);
        return this.repo.save(found);
    }

    /**
     * Borra el registro Y todos sus archivos en S3 — los adjuntos principales
     * más los de cada comentario de bitácora, en los 5 departamentos. Best
     * effort en la limpieza de S3 (Promise.allSettled + log): un fallo
     * puntual de aws_services_backend no debe impedir borrar el registro,
     * pero no queremos dejar archivos huérfanos cuando sí se puede.
     */
    async remove(id: string): Promise<{ deleted: true; id: string }> {
        const found = await this.findOne(id);
        await this.cleanupS3Attachments(found);
        await this.repo.remove(found);
        return { deleted: true, id };
    }

    private async cleanupS3Attachments(found: LeaveOfAbsence): Promise<void> {
        const keys = new Set<string>();
        (found.attachments ?? []).forEach((key) => keys.add(key));
        Object.values(found.department_logs ?? {}).forEach((status) => {
            (status.entries ?? []).forEach((entry) => {
                (entry.attachments ?? []).forEach((key) => keys.add(key));
            });
        });
        if (!keys.size) return;

        const keyList = [...keys];
        const results = await Promise.allSettled(
            keyList.map((key) => deleteLoaS3File(found.id, key)),
        );
        results.forEach((result, i) => {
            if (result.status === 'rejected') {
                this.logger.warn(
                    `Failed to delete S3 attachment for LOA ${found.id} (key: ${keyList[i]}): ${result.reason}`,
                );
            }
        });
    }

    // ── Bitácoras de departamento ───────────────────────────────────────────

    private assertValidDepartment(department: string): asserts department is LoaDepartmentEnum {
        if (!LOA_DEPARTMENTS.includes(department as LoaDepartmentEnum)) {
            throw new BadRequestException(
                `department must be one of: ${LOA_DEPARTMENTS.join(', ')}`,
            );
        }
    }

    async addDepartmentLogEntry(
        id: string,
        department: string,
        dto: AddDepartmentLogEntryDto,
    ): Promise<LeaveOfAbsence> {
        this.assertValidDepartment(department);
        const found = await this.findOne(id);

        // Fase automática POR DEPARTAMENTO: cada depto es independiente — no
        // depende del flag global returned_to_work (HR). Si este depto ya se
        // marcó como "attended", sus siguientes comentarios son de
        // reactivación; si no, son de desactivación. El empleado puede
        // regresar antes de la fecha de fin del LOA, y cada depto reacciona
        // a su propio progreso, no al de HR.
        const phase = found.department_logs[department].attended
            ? LoaLogPhaseEnum.Reactivation
            : LoaLogPhaseEnum.Deactivation;

        found.department_logs[department].entries.push({
            id: randomUUID(),
            comment: dto.comment,
            attachments: dto.attachments ?? [],
            added_by: dto.added_by,
            created_at: new Date().toISOString(),
            phase,
        });

        return this.repo.save(found);
    }

    async setDepartmentAttended(
        id: string,
        department: string,
        dto: SetDepartmentAttendedDto,
    ): Promise<LeaveOfAbsence> {
        this.assertValidDepartment(department);
        const found = await this.findOne(id);

        const status = found.department_logs[department];
        const wasAttended = status.attended;
        status.attended = dto.attended;
        status.attended_by = dto.actor;
        status.attended_at = new Date().toISOString();

        const saved = await this.repo.save(found);

        // Correo solo en la transición false → true (no en el desmarque).
        if (dto.attended && !wasAttended) {
            await this.notifyDepartmentAttended(saved, department, dto.actor);
        }

        return saved;
    }

    async setDepartmentReactivated(
        id: string,
        department: string,
        dto: SetDepartmentReactivatedDto,
    ): Promise<LeaveOfAbsence> {
        this.assertValidDepartment(department);
        const found = await this.findOne(id);

        const status = found.department_logs[department];

        // Dos condiciones para reactivarse: (1) el propio depto ya se marcó
        // "attended" y (2) HR ya marcó returned_to_work=true a nivel de LOA.
        // El attended sigue siendo independiente por depto (no depende de
        // returned_to_work para SU desactivación) — pero la reactivación sí
        // requiere que HR haya confirmado el regreso.
        if (dto.reactivated && !status.attended) {
            throw new BadRequestException(
                'Este departamento debe marcarse como "attended" antes de poder reactivarse.',
            );
        }
        if (dto.reactivated && !found.returned_to_work) {
            throw new BadRequestException(
                'No se puede reactivar antes de que HR confirme el regreso del empleado (returned_to_work).',
            );
        }

        const wasReactivated = status.reactivated;
        status.reactivated = dto.reactivated;
        status.reactivated_by = dto.actor;
        status.reactivated_at = new Date().toISOString();

        const saved = await this.repo.save(found);

        // Correo solo en la transición false → true (no en el desmarque).
        if (dto.reactivated && !wasReactivated) {
            await this.notifyDepartmentReactivated(saved, department, dto.actor);
        }

        return saved;
    }

    /**
     * Exclusivo de loa-hr (NO management) — sin guard en el backend, el rol
     * se valida en el frontend (mismo criterio que el resto del módulo).
     *
     * Deliberado: el undo de returned_to_work NO revierte el reactivated ya
     * marcado por un depto. reactivated es la confirmación propia de ESE
     * depto (hecho consumado, con su propio actor/timestamp) — no un
     * derivado en vivo de returned_to_work. returned_to_work solo actúa como
     * gate para PODER marcarlo (ver setDepartmentReactivated); una vez
     * marcado, queda como registro histórico aunque HR corrija después.
     */
    async markReturnedToWork(id: string, dto: MarkReturnedToWorkDto): Promise<LeaveOfAbsence> {
        const found = await this.findOne(id);
        const wasReturned = found.returned_to_work;

        found.returned_to_work = dto.returned_to_work;
        found.returned_to_work_by = dto.actor;
        found.returned_to_work_at = dto.returned_to_work ? new Date() : null;

        const saved = await this.repo.save(found);

        // Correo solo si realmente cambió (evita spam si se llama dos veces con el mismo valor).
        if (dto.returned_to_work !== wasReturned) {
            await this.notifyReturnedToWork(saved, dto.returned_to_work, dto.actor);
        }

        return saved;
    }
}

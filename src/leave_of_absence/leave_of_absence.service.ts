import { randomUUID } from 'crypto';
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
    emptyDepartmentLogs,
    emptyHrLog,
    LeaveOfAbsence,
    LoaActor,
    LoaDepartmentLogs,
} from './entities/leave-of-absence.entity';
import { LoaSubtaskTemplate } from './entities/loa-subtask-template.entity';
import { CreateLeaveOfAbsenceDto } from './dto/create-leave-of-absence.dto';
import { UpdateLeaveOfAbsenceDto } from './dto/update-leave-of-absence.dto';
import { AddDepartmentLogEntryDto } from './dto/add-department-log-entry.dto';
import { SetDepartmentAttendedDto } from './dto/set-department-attended.dto';
import { CreateSubtaskDto } from './dto/create-subtask.dto';
import { UpdateSubtaskLabelDto } from './dto/update-subtask-label.dto';
import { SetSubtaskCompletedDto } from './dto/set-subtask-completed.dto';
import { SetHrDoneDto } from './dto/set-hr-done.dto';
import { MarkReturnedToWorkDto } from './dto/mark-returned-to-work.dto';
import { LOA_DEPARTMENTS, LoaDepartmentEnum, LoaLogPhaseEnum } from './enums';
import { deleteLoaS3File } from '../common/aws-services.client';
import { LoaEmailApiClient } from './api/loa-email.api';
import { LoaEmailFormDataDto, LoaEmailRecipientDto } from './dto/loa-email.dto';
import {
    LOA_DEPARTMENT_DISABLE_ACTIONS,
    LOA_DEPARTMENT_LABELS,
    LOA_RETURN_TO_WORK_NOTICE,
    resolveEducationRoles,
} from './constants/department-actions';
import { EmployeesV2Service } from '../employees/employees-v2.service';

@Injectable()
export class LeaveOfAbsenceService {
    private readonly logger = new Logger(LeaveOfAbsenceService.name);
    private readonly emailApi: LoaEmailApiClient;

    constructor(
        @InjectRepository(LeaveOfAbsence)
        private readonly repo: Repository<LeaveOfAbsence>,
        @InjectRepository(LoaSubtaskTemplate)
        private readonly templateRepo: Repository<LoaSubtaskTemplate>,
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
            department_logs: await this.seedDepartmentLogsFromTemplates(),
            hr_log: emptyHrLog(),
        });
        const saved = await this.repo.save(entity);
        await this.notifyCreated(saved);
        return saved;
    }

    /**
     * Todo LOA nuevo arranca con el checklist de "Temporary Offboarding" de
     * cada depto YA sembrado a partir de sus templates reutilizables
     * (LoaSubtaskTemplate) — listo para que el depto entre a comentar sin
     * tener que re-registrar nada. `template_id` queda linkeado (ver
     * syncMissingTemplateSubtasks, que usa este mismo link para no duplicar
     * cuando un template se registra DESPUÉS de creado el LOA).
     */
    private async seedDepartmentLogsFromTemplates(): Promise<LoaDepartmentLogs> {
        const base = emptyDepartmentLogs();
        const templates = await this.templateRepo.find();
        templates.forEach((tpl) => {
            const status = base[tpl.department];
            if (!status) return;
            status.subtasks.push({
                key: randomUUID(),
                label: tpl.label,
                template_id: tpl.id,
                completed: false,
                completed_by: null,
                completed_at: null,
                entries: [],
            });
        });
        return base;
    }

    /**
     * Un template registrado en CUALQUIER momento (por el drawer standalone o
     * al crear una subtarea ad-hoc en otro LOA) debe aparecer en TODOS los
     * LOAs de ese depto que todavía puedan recibir subtareas — no solo en los
     * creados después. Se llama en cada lectura (findOne/findAll). Reglas:
     *  - No toca deptos bloqueados (returned_to_work=true): una bitácora
     *    cerrada no cambia de checklist.
     *  - No duplica: salta templates ya representados por template_id, o por
     *    label (case-insensitive) para subtareas viejas sin template_id
     *    todavía (les hace backfill del link de paso).
     *  - Respeta removed_template_ids: si el depto borró esa subtarea de
     *    ESTE LOA a propósito, no la resucita.
     * Devuelve true si mutó `found` (para que el caller decida si hay que
     * persistir).
     */
    private syncMissingTemplateSubtasks(
        found: LeaveOfAbsence,
        templatesByDept: Record<string, LoaSubtaskTemplate[]>,
    ): boolean {
        if (found.returned_to_work) return false;
        let changed = false;

        LOA_DEPARTMENTS.forEach((dept) => {
            const status = found.department_logs[dept];
            const templates = templatesByDept[dept] ?? [];
            if (!status || !templates.length) return;

            const removedIds = new Set(status.removed_template_ids ?? []);

            templates.forEach((tpl) => {
                if (removedIds.has(tpl.id)) return;
                if (status.subtasks.some((s) => s.template_id === tpl.id)) return;

                const normalized = tpl.label.trim().toLowerCase();
                const legacyMatch = status.subtasks.find(
                    (s) => !s.template_id && s.label.trim().toLowerCase() === normalized,
                );
                if (legacyMatch) {
                    legacyMatch.template_id = tpl.id;
                    changed = true;
                    return;
                }

                status.subtasks.push({
                    key: randomUUID(),
                    label: tpl.label,
                    template_id: tpl.id,
                    completed: false,
                    completed_by: null,
                    completed_at: null,
                    entries: [],
                });
                changed = true;
            });
        });

        return changed;
    }

    private groupTemplatesByDept(templates: LoaSubtaskTemplate[]): Record<string, LoaSubtaskTemplate[]> {
        const grouped: Record<string, LoaSubtaskTemplate[]> = {};
        templates.forEach((tpl) => {
            (grouped[tpl.department] ??= []).push(tpl);
        });
        return grouped;
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

    /** Creación: al submitter (confirmación) + a cada depto por separado (sus propias acciones de Temporary Offboarding). */
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
                const recipients = await this.recipientsForRoles(this.rolesForDepartment(found, dept));
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
     * Rol(es) de LOA que atienden un depto para ESTE LOA en particular. Para
     * todos los deptos es 1:1 con `loa-<depto>` — excepto Education, que
     * desde el split loa-education-teacher/loa-education-instructor se
     * resuelve según el multi_type_of_job del empleado (ver
     * resolveEducationRoles). Se usa tanto para el email de creación
     * (notifyCreated) como para el aviso de returned_to_work
     * (notifyReturnedToWork) — así solo se notifica al lado de Education que
     * realmente le corresponde a este empleado, no a los dos.
     */
    private rolesForDepartment(found: LeaveOfAbsence, dept: LoaDepartmentEnum): string[] {
        if (dept === LoaDepartmentEnum.Education) {
            return resolveEducationRoles(found.employee_data?.multi_type_of_job);
        }
        return [`loa-${dept}`];
    }

    /**
     * Un depto marcó "Temporary Offboarding done": le llega a TODO loa-hr (puede haber
     * varios) + a quien lo marcó (actorRecipient — si ese actor ya es loa-hr, el dedupe
     * de email_service evita el duplicado). El submitter NO recibe esto — solo se le
     * notifica en la creación.
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

    /**
     * HR marcó/desmarcó returned_to_work. El submitter NO recibe esto — solo se le
     * notifica en la creación (a menos que también sea el actor de esta acción). Ya no
     * hay checklist de reactivación por depto — es un solo correo combinado a los 5
     * deptos + TODO loa-hr + quien lo marcó, tanto para confirmar el regreso (avisa que
     * las bitácoras quedan bloqueadas) como para el undo (avisa que se desbloquean).
     */
    private async notifyReturnedToWork(found: LeaveOfAbsence, isReturning: boolean, actor: LoaActor): Promise<void> {
        const actorName = this.actorFullName(actor);
        const recipients = [
            ...(await this.recipientsForRoles(LOA_DEPARTMENTS.flatMap((d) => this.rolesForDepartment(found, d)))),
            ...(await this.recipientsForRoles(['loa-hr'])),
            ...this.actorRecipient(actor),
        ];
        if (!recipients.length) return;

        await this.safeSend(`loa:returned_to_work:${isReturning ? 'confirmed' : 'undo'}`, () =>
            this.emailApi.sendTemplate({
                recipientsObjects: recipients,
                templateName: isReturning ? 'loa_returned_to_work' : 'loa_returned_to_work_undo',
                formData: this.baseEmailFormData(found, {
                    departmentLabel: 'All departments',
                    actionItems: isReturning ? this.actionItemsHtml(LOA_RETURN_TO_WORK_NOTICE) : undefined,
                    actorName,
                }),
                actor: 'HR',
            }),
        );
    }

    async findAll(): Promise<LeaveOfAbsence[]> {
        const rows = await this.repo.find({ order: { createdAt: 'DESC' } });
        const templatesByDept = this.groupTemplatesByDept(await this.templateRepo.find());

        const toSave: LeaveOfAbsence[] = [];
        rows.forEach((row) => {
            this.backfill(row);
            if (this.syncMissingTemplateSubtasks(row, templatesByDept)) toSave.push(row);
        });
        if (toSave.length) await this.repo.save(toSave);

        return rows;
    }

    async findOne(id: string): Promise<LeaveOfAbsence> {
        const found = await this.repo.findOne({ where: { id } });
        if (!found) {
            throw new NotFoundException(`LeaveOfAbsence ${id} not found`);
        }
        this.backfill(found);

        const templatesByDept = this.groupTemplatesByDept(await this.templateRepo.find());
        if (this.syncMissingTemplateSubtasks(found, templatesByDept)) {
            return this.repo.save(found);
        }
        return found;
    }

    /**
     * Backfill defensivo para registros creados antes de alguna de las
     * migraciones aditivas de este módulo (department_logs, subtasks, hr_log,
     * template_id/removed_template_ids) — todas son jsonb, así que un
     * registro viejo puede simplemente no traer la key todavía. Se siembra
     * vacío en memoria al leer; se persiste recién cuando esa parte reciba su
     * primera mutación real (acá o en syncMissingTemplateSubtasks).
     *
     * Mismo criterio aplica a un DEPARTAMENTO ENTERO agregado después de que
     * el LOA ya existía (ej. Accounting, agregado a LOA_DEPARTMENTS más
     * tarde): `status` viene undefined para ese LOA viejo — antes se
     * saltaba con `return` y esa key jsonb quedaba faltante para siempre; el
     * fix es sembrarla acá en vez de solo hacer skip, así "accounting"
     * aparece retroactivamente en los LOAs existentes, no solo en los nuevos.
     */
    private backfill(row: LeaveOfAbsence): void {
        if (!row.department_logs || Object.keys(row.department_logs).length === 0) {
            row.department_logs = emptyDepartmentLogs();
        } else {
            LOA_DEPARTMENTS.forEach((dept) => {
                let status = row.department_logs[dept];
                if (!status) {
                    status = emptyDepartmentLogs()[dept];
                    row.department_logs[dept] = status;
                }
                if (!Array.isArray(status.subtasks)) status.subtasks = [];
                if (!Array.isArray(status.removed_template_ids)) status.removed_template_ids = [];
                status.subtasks.forEach((s) => {
                    if (s.template_id === undefined) s.template_id = null;
                });
            });
        }
        if (!row.hr_log || typeof row.hr_log.done !== 'boolean') {
            row.hr_log = emptyHrLog();
        }
    }

    async update(id: string, dto: UpdateLeaveOfAbsenceDto): Promise<LeaveOfAbsence> {
        const found = await this.findOne(id);
        Object.assign(found, dto);
        return this.repo.save(found);
    }

    /**
     * Borra el registro Y todos sus archivos en S3 — los adjuntos principales
     * más los de cada comentario de bitácora, en los 5 departamentos y en la
     * de HR. Best effort en la limpieza de S3 (Promise.allSettled + log): un
     * fallo puntual de aws_services_backend no debe impedir borrar el
     * registro, pero no queremos dejar archivos huérfanos cuando sí se puede.
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
            (status.subtasks ?? []).forEach((subtask) => {
                (subtask.entries ?? []).forEach((entry) => {
                    (entry.attachments ?? []).forEach((key) => keys.add(key));
                });
            });
        });
        (found.hr_log?.entries ?? []).forEach((entry) => {
            (entry.attachments ?? []).forEach((key) => keys.add(key));
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

    // ── Bitácoras de departamento — checklist de "Temporary Offboarding" ────

    private assertValidDepartment(department: string): asserts department is LoaDepartmentEnum {
        if (!LOA_DEPARTMENTS.includes(department as LoaDepartmentEnum)) {
            throw new BadRequestException(
                `department must be one of: ${LOA_DEPARTMENTS.join(', ')}`,
            );
        }
    }

    /**
     * Una vez que HR marca returned_to_work=true, las bitácoras de los 5
     * deptos quedan bloqueadas por completo (ni comentarios, ni subtareas
     * nuevas, ni completar/editar/borrar, ni "Temporary Offboarding done") —
     * requisito explícito. La bitácora de HR NUNCA se bloquea por esto (ver
     * addHrLogEntry/setHrDone). El undo (returned_to_work=false) las
     * desbloquea automáticamente: es el mismo check evaluando distinto, sin
     * lógica adicional de por medio.
     */
    private assertDepartmentNotLocked(found: LeaveOfAbsence): void {
        if (found.returned_to_work) {
            throw new BadRequestException(
                'Esta bitácora está bloqueada: el empleado ya fue marcado como returned to work.',
            );
        }
    }

    /** Legacy — ya no se usa desde la UI (reemplazado por subtareas), se conserva por compatibilidad de datos viejos. */
    async addDepartmentLogEntry(
        id: string,
        department: string,
        dto: AddDepartmentLogEntryDto,
    ): Promise<LeaveOfAbsence> {
        this.assertValidDepartment(department);
        const found = await this.findOne(id);
        this.assertDepartmentNotLocked(found);

        found.department_logs[department].entries.push({
            id: randomUUID(),
            comment: dto.comment,
            attachments: dto.attachments ?? [],
            added_by: dto.added_by,
            created_at: new Date().toISOString(),
            phase: LoaLogPhaseEnum.Deactivation,
        });

        return this.repo.save(found);
    }

    private findSubtask(found: LeaveOfAbsence, department: LoaDepartmentEnum, subtaskKey: string) {
        const status = found.department_logs[department];
        const subtask = (status.subtasks ?? []).find((s) => s.key === subtaskKey);
        if (!subtask) {
            throw new NotFoundException(`Subtask "${subtaskKey}" not found for department ${department}`);
        }
        return subtask;
    }

    /**
     * Alta de una subtarea de "Temporary Offboarding" en ESTE LOA puntual. Se
     * registra automáticamente como template reutilizable (dedupe por texto,
     * ver ensureTemplateExists) para que quede disponible en TODO LOA de este
     * depto — tanto los nuevos como los ya existentes (ver
     * syncMissingTemplateSubtasks) — sin tener que volver a escribirla.
     */
    async createSubtask(
        id: string,
        department: string,
        dto: CreateSubtaskDto,
    ): Promise<LeaveOfAbsence> {
        this.assertValidDepartment(department);
        const found = await this.findOne(id);
        this.assertDepartmentNotLocked(found);
        const status = found.department_logs[department];
        const label = dto.label.trim();

        if (!Array.isArray(status.subtasks)) {
            status.subtasks = [];
        }

        const template = await this.ensureTemplateExists(department as LoaDepartmentEnum, label, dto.actor);

        status.subtasks.push({
            key: randomUUID(),
            label,
            template_id: template?.id ?? null,
            completed: false,
            completed_by: null,
            completed_at: null,
            entries: [],
        });

        return this.repo.save(found);
    }

    /**
     * Devuelve el template reutilizable con este texto (case-insensitive,
     * trim) para ese depto, o lo crea si todavía no existe — evita
     * duplicados cuando el mismo texto se registra en varios LOAs. Best
     * effort: un fallo acá no debe tumbar el alta de la subtarea del LOA
     * (createSubtask sigue guardando la subtarea con template_id: null).
     */
    private async ensureTemplateExists(
        department: LoaDepartmentEnum,
        label: string,
        actor: LoaActor,
    ): Promise<LoaSubtaskTemplate | null> {
        try {
            const normalized = label.trim().toLowerCase();
            if (!normalized) return null;
            const existing = await this.templateRepo.find({ where: { department } });
            const match = existing.find((t) => t.label.trim().toLowerCase() === normalized);
            if (match) return match;
            return await this.templateRepo.save(
                this.templateRepo.create({ department, label, created_by: actor }),
            );
        } catch (err: any) {
            this.logger.warn(`Failed to persist subtask template (non-blocking): ${err?.message || err}`);
            return null;
        }
    }

    // ── Templates reutilizables de subtareas por depto (CRUD independiente) ──

    async listSubtaskTemplates(department: string): Promise<LoaSubtaskTemplate[]> {
        this.assertValidDepartment(department);
        return this.templateRepo.find({
            where: { department },
            order: { createdAt: 'ASC' },
        });
    }

    async createSubtaskTemplate(department: string, dto: CreateSubtaskDto): Promise<LoaSubtaskTemplate> {
        this.assertValidDepartment(department);
        const label = dto.label.trim();
        return this.templateRepo.save(
            this.templateRepo.create({ department, label, created_by: dto.actor }),
        );
    }

    private async findTemplateOrThrow(department: LoaDepartmentEnum, templateId: string): Promise<LoaSubtaskTemplate> {
        const tpl = await this.templateRepo.findOne({ where: { id: templateId, department } });
        if (!tpl) {
            throw new NotFoundException(`Template ${templateId} not found for department ${department}`);
        }
        return tpl;
    }

    async updateSubtaskTemplate(
        department: string,
        templateId: string,
        dto: UpdateSubtaskLabelDto,
    ): Promise<LoaSubtaskTemplate> {
        this.assertValidDepartment(department);
        const tpl = await this.findTemplateOrThrow(department, templateId);
        tpl.label = dto.label.trim();
        return this.templateRepo.save(tpl);
    }

    /**
     * Borra el template — deja de sembrarse en LOAs futuros. NO afecta las
     * instancias ya sembradas en LOAs existentes (snapshots independientes).
     */
    async deleteSubtaskTemplate(department: string, templateId: string): Promise<{ deleted: true; id: string }> {
        this.assertValidDepartment(department);
        const tpl = await this.findTemplateOrThrow(department, templateId);
        await this.templateRepo.remove(tpl);
        return { deleted: true, id: templateId };
    }

    /** Edita el texto de una subtarea ya creada — no toca su estado ni historial. */
    async updateSubtaskLabel(
        id: string,
        department: string,
        subtaskKey: string,
        dto: UpdateSubtaskLabelDto,
    ): Promise<LeaveOfAbsence> {
        this.assertValidDepartment(department);
        const found = await this.findOne(id);
        this.assertDepartmentNotLocked(found);
        const subtask = this.findSubtask(found, department, subtaskKey);

        subtask.label = dto.label.trim();

        return this.repo.save(found);
    }

    /**
     * Borra una subtarea completa (con su historial de comentarios/evidencia).
     * Si venía de un template, registra su id en removed_template_ids para
     * que syncMissingTemplateSubtasks NO la vuelva a agregar sola en la
     * próxima lectura de ESTE LOA — el template en sí sigue vivo (sigue
     * sembrándose en LOAs nuevos y en el resto de los existentes). Best-effort
     * en la limpieza de S3 de sus adjuntos — un fallo puntual no debe impedir
     * borrar el registro, mismo criterio que cleanupS3Attachments.
     */
    async deleteSubtask(
        id: string,
        department: string,
        subtaskKey: string,
        actor?: LoaActor,
    ): Promise<LeaveOfAbsence> {
        this.assertValidDepartment(department);
        const found = await this.findOne(id);
        this.assertDepartmentNotLocked(found);
        const status = found.department_logs[department];
        const subtask = this.findSubtask(found, department, subtaskKey);

        if (subtask.template_id) {
            if (!Array.isArray(status.removed_template_ids)) status.removed_template_ids = [];
            if (!status.removed_template_ids.includes(subtask.template_id)) {
                status.removed_template_ids.push(subtask.template_id);
            }
        }

        this.logger.log(
            `Subtask "${subtaskKey}" (${subtask.label}) deleted from LOA ${id}/${department}` +
            (actor ? ` by ${this.actorFullName(actor)}` : '') +
            (subtask.completed ? ' — WAS COMPLETED (historical entries removed)' : ''),
        );

        const keys = new Set<string>();
        (subtask.entries ?? []).forEach((entry) => {
            (entry.attachments ?? []).forEach((key) => keys.add(key));
        });
        if (keys.size) {
            const results = await Promise.allSettled([...keys].map((key) => deleteLoaS3File(found.id, key)));
            results.forEach((result) => {
                if (result.status === 'rejected') {
                    this.logger.warn(
                        `Failed to delete S3 attachment for subtask ${subtaskKey} (LOA ${found.id}): ${result.reason}`,
                    );
                }
            });
        }

        status.subtasks = status.subtasks.filter((s) => s.key !== subtaskKey);

        return this.repo.save(found);
    }

    /** Agrega un comentario/evidencia al mini-historial de UNA subtarea puntual. */
    async addSubtaskEntry(
        id: string,
        department: string,
        subtaskKey: string,
        dto: AddDepartmentLogEntryDto,
    ): Promise<LeaveOfAbsence> {
        this.assertValidDepartment(department);
        const found = await this.findOne(id);
        this.assertDepartmentNotLocked(found);
        const subtask = this.findSubtask(found, department, subtaskKey);

        subtask.entries.push({
            id: randomUUID(),
            comment: dto.comment,
            attachments: dto.attachments ?? [],
            added_by: dto.added_by,
            created_at: new Date().toISOString(),
        });

        return this.repo.save(found);
    }

    /**
     * Marca/desmarca UNA subtarea como completada. Requiere al menos 1 entry
     * (comentario/evidencia) antes de poder marcarse — no completar en seco.
     */
    async setSubtaskCompleted(
        id: string,
        department: string,
        subtaskKey: string,
        dto: SetSubtaskCompletedDto,
    ): Promise<LeaveOfAbsence> {
        this.assertValidDepartment(department);
        const found = await this.findOne(id);
        this.assertDepartmentNotLocked(found);
        const subtask = this.findSubtask(found, department, subtaskKey);

        if (dto.completed && subtask.entries.length === 0) {
            throw new BadRequestException(
                'Esta subtarea necesita al menos un comentario antes de poder marcarse como completada.',
            );
        }

        subtask.completed = dto.completed;
        subtask.completed_by = dto.completed ? dto.actor : null;
        subtask.completed_at = dto.completed ? new Date().toISOString() : null;

        return this.repo.save(found);
    }

    /**
     * Un depto marca su checklist completo de "Temporary Offboarding" como
     * done. Requiere al menos 1 subtarea registrada Y todas completadas — si
     * el depto no registró ninguna, no hay evidencia de trabajo real.
     */
    async setDepartmentAttended(
        id: string,
        department: string,
        dto: SetDepartmentAttendedDto,
    ): Promise<LeaveOfAbsence> {
        this.assertValidDepartment(department);
        const found = await this.findOne(id);
        this.assertDepartmentNotLocked(found);

        const status = found.department_logs[department];

        if (dto.attended) {
            const subtasks = status.subtasks ?? [];
            if (!subtasks.length) {
                throw new BadRequestException(
                    'Este departamento debe registrar al menos una subtarea antes de marcar "Temporary Offboarding done".',
                );
            }
            const pending = subtasks.filter((s) => !s.completed);
            if (pending.length) {
                throw new BadRequestException(
                    `Faltan ${pending.length} subtarea(s) por completar antes de marcar "Temporary Offboarding done".`,
                );
            }
        }

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

    // ── Bitácora exclusiva de HR — sin subtareas, nunca se bloquea ──────────

    /** Comentario/evidencia libre en la bitácora de HR. */
    async addHrLogEntry(id: string, dto: AddDepartmentLogEntryDto): Promise<LeaveOfAbsence> {
        const found = await this.findOne(id);
        if (!found.hr_log) found.hr_log = emptyHrLog();

        found.hr_log.entries.push({
            id: randomUUID(),
            comment: dto.comment,
            attachments: dto.attachments ?? [],
            added_by: dto.added_by,
            created_at: new Date().toISOString(),
        });

        return this.repo.save(found);
    }

    /**
     * HR marca su bitácora como "done" — solo permitido cuando los 5 deptos
     * ya marcaron su "Temporary Offboarding done" y HR registró al menos 1
     * comentario propio.
     */
    async setHrDone(id: string, dto: SetHrDoneDto): Promise<LeaveOfAbsence> {
        const found = await this.findOne(id);
        if (!found.hr_log) found.hr_log = emptyHrLog();

        if (dto.done) {
            const pendingDepts = LOA_DEPARTMENTS.filter((d) => !found.department_logs[d]?.attended);
            if (pendingDepts.length) {
                throw new BadRequestException(
                    `Todos los departamentos deben marcar "Temporary Offboarding done" antes de que HR pueda cerrar (pendiente: ${pendingDepts.join(', ')}).`,
                );
            }
            if (!found.hr_log.entries.length) {
                throw new BadRequestException(
                    'HR debe registrar al menos un comentario antes de marcar "done".',
                );
            }
        }

        found.hr_log.done = dto.done;
        found.hr_log.done_by = dto.done ? dto.actor : null;
        found.hr_log.done_at = dto.done ? new Date().toISOString() : null;

        return this.repo.save(found);
    }

    /**
     * Exclusivo de loa-hr — sin guard en el backend, el rol se valida en el
     * frontend (mismo criterio que el resto del módulo). true bloquea las
     * bitácoras de los 5 deptos (ver assertDepartmentNotLocked) hasta que se
     * vuelva a marcar false (undo) — la bitácora de HR nunca se bloquea.
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

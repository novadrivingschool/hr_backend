import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    UpdateDateColumn,
} from 'typeorm';
import { LOA_DEPARTMENTS, LoaDepartmentEnum, LoaLogPhaseEnum, LoaTypeEnum } from '../enums';

/** Snapshot del empleado al momento de crear/editar el LOA — no se re-resuelve luego. */
export interface LoaEmployeeSnapshot {
    name: string;
    last_name: string;
    employee_number: string;
    nova_email?: string;
    multi_department?: string[];
}

/** Quién hizo la acción — mismo shape que EmployeeRefDto usado en i-care. */
export interface LoaActor {
    name: string;
    last_name: string;
    employee_number: string;
    nova_email?: string;
}

/**
 * Una entrada de bitácora general de departamento — legacy, previo a las
 * subtareas. Ya no recibe entries nuevas (ver LeaveOfAbsenceService), se
 * conserva solo para mostrar histórico de LOAs viejos. `phase` queda como
 * campo congelado de esos registros — el módulo ya no tiene dos fases.
 */
export interface LoaDepartmentLogEntry {
    id: string;
    comment: string;
    /** Keys de S3, máx. 5 por comentario (enforced en el DTO). */
    attachments: string[];
    added_by: LoaActor;
    created_at: string;
    phase: LoaLogPhaseEnum;
}

/** Comentario + evidencia dentro de UNA subtarea (su propio mini historial), o en la bitácora de HR. */
export interface LoaSubtaskEntry {
    id: string;
    comment: string;
    /** Keys de S3, máx. 5 por comentario (enforced en el DTO). */
    attachments: string[];
    added_by: LoaActor;
    created_at: string;
}

/**
 * Una subtarea del checklist de "Temporary Offboarding" de un depto. Se
 * registra libremente (CRUD completo: create/update label/delete, ver
 * LeaveOfAbsenceService) — `key` es un uuid propio de ESTE LOA. `template_id`
 * enlaza a la LoaSubtaskTemplate que la originó (null si por algún motivo no
 * se pudo resolver/crear el template — best effort, ver ensureTemplateExists)
 * y es lo que usa syncMissingTemplateSubtasks para no duplicarla cuando se
 * re-sincroniza en cada lectura. Un solo stage — ya no existe "reactivation".
 */
export interface LoaSubtask {
    key: string;
    label: string;
    template_id: string | null;
    completed: boolean;
    completed_by: LoaActor | null;
    completed_at: string | null;
    entries: LoaSubtaskEntry[];
}

/**
 * Estado de un departamento sobre este LOA: su checklist de subtareas de
 * Temporary Offboarding + su checkbox "done". Ya no existe reactivated — esa
 * etapa la reemplaza returned_to_work (a nivel LOA) + la bitácora de HR.
 */
export interface LoaDepartmentLogStatus {
    attended: boolean;
    attended_by: LoaActor | null;
    attended_at: string | null;
    /** Histórico general previo a las subtareas — se conserva por compatibilidad, ya no se le agregan entries nuevas. */
    entries: LoaDepartmentLogEntry[];
    /**
     * Subtareas de Temporary Offboarding de ESTE LOA. Se auto-sincronizan con
     * los templates del depto en cada lectura (ver
     * LeaveOfAbsenceService.syncMissingTemplateSubtasks) — cualquier template
     * nuevo aparece acá solo, sin tener que re-registrarlo por LOA.
     */
    subtasks: LoaSubtask[];
    /**
     * template_id de subtareas que el depto borró explícitamente de ESTE LOA
     * — evita que syncMissingTemplateSubtasks las vuelva a agregar en la
     * próxima lectura (si no se trackeara esto, un template borrado de la
     * bitácora "resucitaría" solo al reabrir).
     */
    removed_template_ids: string[];
}

export type LoaDepartmentLogs = Record<LoaDepartmentEnum, LoaDepartmentLogStatus>;

/**
 * Bitácora exclusiva de HR — NO tiene subtareas (no se registran ahí), solo
 * comentarios/evidencia libres + un checkbox "done" propio. "done" solo se
 * puede marcar cuando los 5 deptos ya marcaron su "Temporary Offboarding
 * done" (ver LeaveOfAbsenceService.setHrDone). A diferencia de los 5 deptos,
 * esta bitácora NUNCA se bloquea cuando HR marca returned_to_work.
 */
export interface LoaHrLogStatus {
    done: boolean;
    done_by: LoaActor | null;
    done_at: string | null;
    entries: LoaSubtaskEntry[];
}

/** Estado inicial de los 5 departamentos — se siembra al crear el LOA. Subtareas arrancan vacías: cada depto las registra por su cuenta. */
export function emptyDepartmentLogs(): LoaDepartmentLogs {
    const empty = (): LoaDepartmentLogStatus => ({
        attended: false,
        attended_by: null,
        attended_at: null,
        entries: [],
        subtasks: [],
        removed_template_ids: [],
    });
    return LOA_DEPARTMENTS.reduce((acc, dept) => {
        acc[dept] = empty();
        return acc;
    }, {} as LoaDepartmentLogs);
}

export function emptyHrLog(): LoaHrLogStatus {
    return { done: false, done_by: null, done_at: null, entries: [] };
}

@Entity('leave_of_absence_requests')
export class LeaveOfAbsence {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    /**
     * Empleado al que aplica el LOA. Se resuelve por live search (no texto
     * libre) — employee_number es la referencia real, employee_data es el
     * snapshot de nombre/depto/email al momento de la acción (mismo patrón
     * que Absence.employee_data).
     */
    @Column({ type: 'varchar', length: 50 })
    employee_number: string;

    @Column({ type: 'jsonb' })
    employee_data: LoaEmployeeSnapshot;

    @Column({ type: 'date' })
    startDate: string;

    @Column({ type: 'date' })
    endDate: string;

    /** Fecha de regreso — puede diferir de endDate. */
    @Column({ type: 'date', nullable: true })
    returnDate: string | null;

    @Column({
        type: 'enum',
        enum: LoaTypeEnum,
        enumName: 'loa_type',
    })
    loaType: LoaTypeEnum;

    @Column({ type: 'text', nullable: true })
    notes: string | null;

    /** Checkbox "Registrado en Inspirity". Desmarcado por defecto. */
    @Column({ type: 'boolean', default: false })
    registeredInInspirity: boolean;

    /** Checkbox "Wellness Packages". */
    @Column({ type: 'boolean', default: false })
    wellnessPackages: boolean;

    /**
     * Keys de S3 (`hr-loa/<id>/<uuid>.<ext>`) devueltas por el recurso propio
     * `leave-of-absence/files` de aws_services_backend. No son URLs firmadas
     * — esas se piden al momento de mostrar/descargar (expiran a los 5 min).
     */
    @Column({ type: 'jsonb', nullable: true, default: () => "'[]'" })
    attachments: string[];

    @Column({ type: 'jsonb' })
    created_by: LoaActor;

    @Column({ type: 'jsonb', nullable: true })
    updated_by: LoaActor | null;

    /**
     * Bitácoras de los 5 departamentos que atienden un LOA (checklist de
     * Temporary Offboarding). Sembrado vacío al crear — ver
     * emptyDepartmentLogs(). Cada departamento se muta por su propio endpoint
     * (no por el PATCH genérico) para que dos departamentos editando a la vez
     * no se pisen. Se bloquean por completo cuando returned_to_work=true.
     */
    @Column({ type: 'jsonb', default: () => "'{}'" })
    department_logs: LoaDepartmentLogs;

    /**
     * Bitácora exclusiva de HR — ver LoaHrLogStatus. Nunca se bloquea por
     * returned_to_work (a diferencia de department_logs).
     */
    @Column({ type: 'jsonb', default: () => "'{}'" })
    hr_log: LoaHrLogStatus;

    /** HR marca esto cuando el empleado ya regresó a trabajar — bloquea las 5 bitácoras de depto. */
    @Column({ type: 'boolean', default: false })
    returned_to_work: boolean;

    @Column({ type: 'jsonb', nullable: true })
    returned_to_work_by: LoaActor | null;

    @Column({ type: 'timestamptz', nullable: true })
    returned_to_work_at: Date | null;

    @CreateDateColumn({ type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
    createdAt: Date;

    @UpdateDateColumn({ type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
    updatedAt: Date;
}

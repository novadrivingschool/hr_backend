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

/** Una entrada de bitácora de departamento — comentario + evidencia + quién/cuándo. */
export interface LoaDepartmentLogEntry {
    id: string;
    comment: string;
    /** Keys de S3, máx. 5 por comentario (enforced en el DTO). */
    attachments: string[];
    added_by: LoaActor;
    created_at: string;
    phase: LoaLogPhaseEnum;
}

/** Estado de un departamento sobre este LOA: su bitácora + sus dos checkboxes. */
export interface LoaDepartmentLogStatus {
    attended: boolean;
    attended_by: LoaActor | null;
    attended_at: string | null;
    reactivated: boolean;
    reactivated_by: LoaActor | null;
    reactivated_at: string | null;
    entries: LoaDepartmentLogEntry[];
}

export type LoaDepartmentLogs = Record<LoaDepartmentEnum, LoaDepartmentLogStatus>;

/** Estado inicial de los 5 departamentos — se siembra al crear el LOA. */
export function emptyDepartmentLogs(): LoaDepartmentLogs {
    const empty = (): LoaDepartmentLogStatus => ({
        attended: false,
        attended_by: null,
        attended_at: null,
        reactivated: false,
        reactivated_by: null,
        reactivated_at: null,
        entries: [],
    });
    return LOA_DEPARTMENTS.reduce((acc, dept) => {
        acc[dept] = empty();
        return acc;
    }, {} as LoaDepartmentLogs);
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
     * Bitácoras de los 5 departamentos que atienden un LOA (desactivar/
     * reactivar accesos). Sembrado vacío al crear — ver emptyDepartmentLogs().
     * Cada departamento se muta por su propio endpoint (no por el PATCH
     * genérico) para que dos departamentos editando a la vez no se pisen.
     */
    @Column({ type: 'jsonb', default: () => "'{}'" })
    department_logs: LoaDepartmentLogs;

    /** HR marca esto cuando el empleado ya regresó a trabajar — dispara la fase de reactivación. */
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

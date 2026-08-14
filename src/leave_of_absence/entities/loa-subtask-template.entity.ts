import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    UpdateDateColumn,
} from 'typeorm';
import { LoaDepartmentEnum } from '../enums';
import { LoaActor } from './leave-of-absence.entity';

/**
 * Subtarea REUTILIZABLE de "Temporary Offboarding" registrada por un depto —
 * vive independiente de cualquier LOA puntual. Se siembra automáticamente en
 * el checklist de TODO LOA nuevo de ese depto (ver
 * LeaveOfAbsenceService.create → seedDepartmentLogsFromTemplates) y también
 * se crea/dedupe automáticamente cuando un depto registra una subtarea
 * ad-hoc en un LOA existente (ver LeaveOfAbsenceService.createSubtask →
 * ensureTemplateExists). Un solo stage — ya no existe "reactivation".
 *
 * Editar o borrar un template NO altera retroactivamente las instancias ya
 * sembradas en LOAs existentes — esas son snapshots independientes (mismo
 * criterio que employee_data/created_by en LeaveOfAbsence).
 *
 * department se guarda como varchar (no un enum de Postgres) — mismo
 * criterio que el resto del módulo: LoaDepartmentEnum nunca se modeló como
 * tipo enum de DB (department_logs es jsonb keyed por string).
 */
@Entity('loa_subtask_templates')
export class LoaSubtaskTemplate {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ type: 'varchar', length: 20 })
    department: LoaDepartmentEnum;

    @Column({ type: 'varchar', length: 300 })
    label: string;

    @Column({ type: 'jsonb' })
    created_by: LoaActor;

    @CreateDateColumn({ type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
    createdAt: Date;

    @UpdateDateColumn({ type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
    updatedAt: Date;
}

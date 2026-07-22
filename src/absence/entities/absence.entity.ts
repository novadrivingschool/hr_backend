import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    UpdateDateColumn,
} from 'typeorm';
import {
    AbsenceStatusEnum,
    AbsenceTimeTypeEnum,
    EventSyncStatusEnum,
} from '../enums';

@Entity('absence_requests')
export class Absence {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ type: 'enum', enum: AbsenceTimeTypeEnum, enumName: 'absence_time_type' })
    timeType: AbsenceTimeTypeEnum;

    // ── Flujo Hours ──────────────────────────────────────────────────────────────
    @Column({ type: 'date', nullable: true })
    hourDate: string | null;

    @Column({ type: 'time', nullable: true })
    startTime: string | null;

    /**
     * Nullable a propósito: con 'No Internet' o 'Power Outage' el empleado puede
     * registrar la absence sin saber a qué hora termina (outage abierto).
     */
    @Column({ type: 'time', nullable: true })
    endTime: string | null;

    // ── Flujo Days ───────────────────────────────────────────────────────────────
    @Column({ type: 'date', nullable: true })
    startDate: string | null;

    @Column({ type: 'date', nullable: true })
    endDate: string | null;

    /**
     * Razón de la absence. Toma valores de OUTAGE_REASONS:
     * 'No Internet' | 'Power Outage' | 'Illness' |
     * 'Medical Emergency' | 'Family Emergency'.
     * Se guarda como varchar (no enum de PG) para espejar schedule_event.reason,
     * que también es varchar — así el valor viaja sin conversión.
     */
    @Column({ type: 'varchar' })
    requestType: string;

    @Column({ type: 'text', nullable: true })
    comments: string | null;

    @Column({ type: 'varchar' })
    dateOrRange: string;

    @Column({
        type: 'enum',
        enum: AbsenceStatusEnum,
        enumName: 'absence_status',
        default: AbsenceStatusEnum.Registered,
    })
    status: AbsenceStatusEnum;

    @Column({ type: 'date' })
    createdDate: string;

    @Column({ type: 'time' })
    createdTime: string;

    @Column({ type: 'jsonb' })
    employee_data: {
        name: string;
        last_name: string;
        employee_number: string;
        multi_department: string[];
        multi_company: string[];
        nova_email: string;
        multi_location: string[];
    };

    @Column({ type: 'jsonb', nullable: true })
    cancellation_info: {
        cancelled_by: string;
        role: 'staff' | 'hr' | 'coordinator' | 'management';
        reason?: string;
        date: string;
        time: string;
    } | null;

    // ── Pago / recuperación ──────────────────────────────────────────────────────
    /**
     * Una absence no se paga. La columna existe para paridad con TOR y para que
     * el evento de Outage tenga qué escribir en schedule_event.is_paid.
     * No se expone en el formulario.
     */
    @Column({ type: 'boolean', default: false })
    is_paid: boolean;

    /**
     * Una absence no autoriza recuperar horas. Existe por paridad con TOR.
     * No se expone en el formulario.
     */
    @Column({ type: 'boolean', default: false })
    recovery_required: boolean;

    // ── Sincronización con master schedule ───────────────────────────────────────
    @Column({
        type: 'enum',
        enum: EventSyncStatusEnum,
        enumName: 'absence_event_sync_status',
        default: EventSyncStatusEnum.Pending,
    })
    event_sync_status: EventSyncStatusEnum;

    @Column({ type: 'text', nullable: true })
    event_sync_error: string | null;

    // ── Auditoría ────────────────────────────────────────────────────────────────
    @CreateDateColumn({ type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
    createdAt: Date;

    @UpdateDateColumn({ type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
    updatedAt: Date;
}

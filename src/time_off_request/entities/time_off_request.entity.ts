import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    UpdateDateColumn,
} from 'typeorm';
import { StatusEnum, TimeTypeEnum } from '../enums';

@Entity('time_off_requests')
export class TimeOffRequest {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    /* @Column({ type: 'varchar' })
    timeType: string; */
    @Column({ type: 'enum', enum: TimeTypeEnum, enumName: 'time_off_time_type' })
    timeType: TimeTypeEnum;

    @Column({ type: 'date', nullable: true })
    hourDate: string;

    @Column({ type: 'time', nullable: true })
    startTime: string;

    @Column({ type: 'time', nullable: true })
    endTime: string;

    @Column({ type: 'date', nullable: true })
    startDate: string;

    @Column({ type: 'date', nullable: true })
    endDate: string;

    @Column({ type: 'varchar' })
    requestType: string;

    @Column({ type: 'text', nullable: true })
    otherDescription: string;

    @Column({ type: 'text', nullable: true })
    comments: string;

    @Column({ type: 'varchar' })
    dateOrRange: string;

    /* @Column({ type: 'varchar', default: 'Pending' })
    status: string; */
    @Column({ type: 'enum', enum: StatusEnum, enumName: 'time_off_status', default: StatusEnum.Pending })
    status: StatusEnum;

    @Column({ type: 'date' })
    createdDate: string;

    @Column({ type: 'time' })
    createdTime: string;

    @Column({ type: 'jsonb' }) // ✅ se guarda como JSON completo
    employee_data: {
        name: string;
        last_name: string;
        employee_number: string;
        multi_department: string[];
        multi_company: string[];
        nova_email: string;
        multi_location: string[];
    };

    @Column({
        type: 'jsonb'
    })
    coordinator_approval: {
        approved: boolean;
        by: string;
        date: string;  // fecha en formato YYYY-MM-DD
        time: string;  // hora en formato HH:mm:ss
    };

    @Column({
        type: 'jsonb'
    })
    hr_approval: {
        approved: boolean;
        by: string;
        date: string;  // fecha en formato YYYY-MM-DD
        time: string;  // hora en formato HH:mm:ss
    };

    @Column({ type: 'text', nullable: true })
    coordinator_comments: string;

    @Column({ type: 'text', nullable: true })
    hr_comments: string;

    @Column({ type: 'jsonb', nullable: true })
    cancellation_info: {
        cancelled_by: string;        // employee_number o nombre
        role: 'staff' | 'hr' | 'coordinator';
        reason?: string;
        date: string;
        time: string;
    } | null;

    // ── Pago ─────────────────────────────────────────────────────────────────────
    @Column({ type: 'boolean', default: false })
    is_paid: boolean;

    // ── Recuperación ─────────────────────────────────────────────────────────────
    @Column({ type: 'boolean', default: false })
    recovery_required: boolean;

    /**
     * Solo aplica si recovery_required === true.
     * Cada entry define un bloque de recuperación:
     *   - date:      YYYY-MM-DD
     *   - startTime: HH:mm
     *   - endTime:   HH:mm
     *
     * Para timeType=Days  → puede haber N entries (una por día a recuperar)
     * Para timeType=Hours → normalmente 1 entry
     */
    @Column({ type: 'jsonb', nullable: true })
    recovery_schedule: Array<{
        date: string;
        startTime: string;
        endTime: string;
    }> | null;

    // ── Auditoría real BD ────────────────────────────────────────────────────────
    @CreateDateColumn({ type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
    createdAt: Date;

    @UpdateDateColumn({ type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
    updatedAt: Date;
}
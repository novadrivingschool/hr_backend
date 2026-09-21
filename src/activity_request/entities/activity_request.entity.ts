import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    UpdateDateColumn,
} from 'typeorm';
import { PunchTypeEnum, SourceEnum, StatusEnum } from '../enums';

@Entity('activity_requests')
export class ActivityRequest {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ type: 'enum', enum: PunchTypeEnum, enumName: 'activity_request_punch_type' })
    punchType: PunchTypeEnum;

    @Column({ type: 'enum', enum: SourceEnum, enumName: 'activity_request_source' })
    source: SourceEnum;

    @Column({ type: 'date' })
    requestedDate: string;

    @Column({ type: 'text' })
    reason: string;

    @Column({ type: 'enum', enum: StatusEnum, enumName: 'activity_request_status', default: StatusEnum.Pending })
    status: StatusEnum;

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

    @Column({ type: 'jsonb' })
    coordinator_approval: {
        approved: boolean;
        by: string;
        date: string;
        time: string;
    };

    @Column({ type: 'jsonb' })
    hr_approval: {
        approved: boolean;
        by: string;
        date: string;
        time: string;
    };

    @Column({ type: 'text', nullable: true })
    coordinator_comments: string;

    @Column({ type: 'text', nullable: true })
    hr_comments: string;

    @Column({ type: 'jsonb', nullable: true })
    cancellation_info: {
        cancelled_by: string;
        role: 'staff' | 'hr' | 'coordinator' | 'management';
        reason?: string;
        date: string;
        time: string;
    } | null;

    @CreateDateColumn({ type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
    createdAt: Date;

    @UpdateDateColumn({ type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
    updatedAt: Date;
}

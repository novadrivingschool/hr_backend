import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('time_off_requests')
export class TimeOffRequest {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ type: 'varchar' })
    timeType: string;

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

    @Column({ type: 'varchar', default: 'Pending' })
    status: string;

    @Column({ type: 'date' })
    createdDate: string;

    @Column({ type: 'time' })
    createdTime: string;

    @Column({ type: 'jsonb' }) // ✅ se guarda como JSON completo
    employee_data: {
        name: string;
        last_name: string;
        employee_number: string;
        department: string;
        country: string;
        company: string;
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

}

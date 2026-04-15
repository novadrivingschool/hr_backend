import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('payroll_timesheet_records')
@Index('IDX_payroll_timesheet_records_employee_day', ['employee', 'day_date'])
@Index('IDX_payroll_timesheet_records_day_date', ['day_date'])
export class TimesheetRecord {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 150 })
  employee: string;

  @Column({ type: 'varchar', length: 50, name: 'hour_type', default: 'Regular' })
  hour_type: string;

  @Column({ type: 'date', name: 'day_date' })
  day_date: string;

  @Column({ type: 'varchar', length: 120, name: 'day_date_raw', nullable: true })
  day_date_raw: string | null;

  @Column({ type: 'varchar', length: 20, name: 'time_in', nullable: true })
  time_in: string | null;

  @Column({ type: 'varchar', length: 20, name: 'time_out', nullable: true })
  time_out: string | null;

  @Column({ type: 'decimal', precision: 8, scale: 2, default: 0 })
  hours: number;

  @Column({ type: 'decimal', precision: 8, scale: 2, name: 'paid_break', default: 0 })
  paid_break: number;

  @Column({ type: 'decimal', precision: 8, scale: 2, name: 'unpaid_break', default: 0 })
  unpaid_break: number;

  @Column({ type: 'decimal', precision: 8, scale: 2, name: 'day_wise_total_hours', default: 0 })
  day_wise_total_hours: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, name: 'total_hours', default: 0 })
  total_hours: number;

  @Column({ type: 'decimal', precision: 8, scale: 2, name: 'total_paid_break', default: 0 })
  total_paid_break: number;

  @Column({ type: 'decimal', precision: 8, scale: 2, name: 'total_unpaid_break', default: 0 })
  total_unpaid_break: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, name: 'total_day_wise_total_hours', default: 0 })
  total_day_wise_total_hours: number;

  @CreateDateColumn({ type: 'timestamp', name: 'created_at', default: () => 'CURRENT_TIMESTAMP' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamp', name: 'updated_at', default: () => 'CURRENT_TIMESTAMP' })
  updated_at: Date;
}

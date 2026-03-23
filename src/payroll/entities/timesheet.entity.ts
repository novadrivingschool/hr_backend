import { Entity, PrimaryGeneratedColumn, Column, Index, Unique } from 'typeorm';

@Entity('payroll_timesheets')
@Unique('UQ_timesheet_employee_date_in', ['employee', 'day_date', 'time_in'])
@Index(['employee', 'day_date'])
export class Timesheet {

  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 150 })
  employee: string;

  @Column({ type: 'varchar', length: 50, name: 'hour_type' })
  hour_type: string;

  @Column({ type: 'date', name: 'day_date' })
  day_date: string;

  @Column({ type: 'varchar', length: 20, name: 'time_in', nullable: true })
  time_in: string | null;

  @Column({ type: 'varchar', length: 20, name: 'time_out', nullable: true })
  time_out: string | null;

  @Column({ type: 'decimal', precision: 6, scale: 2, name: 'hours', default: 0 })
  hours: number;

  @Column({ type: 'decimal', precision: 6, scale: 2, name: 'paid_break', default: 0 })
  paid_break: number;

  @Column({ type: 'decimal', precision: 6, scale: 2, name: 'unpaid_break', default: 0 })
  unpaid_break: number;

  @Column({ type: 'decimal', precision: 6, scale: 2, name: 'day_wise_total_hours', default: 0 })
  day_wise_total_hours: number;

  @Column({ type: 'decimal', precision: 8, scale: 2, name: 'total_hours', default: 0 })
  total_hours: number;

  @Column({ type: 'decimal', precision: 6, scale: 2, name: 'total_paid_break', default: 0 })
  total_paid_break: number;

  @Column({ type: 'decimal', precision: 6, scale: 2, name: 'total_unpaid_break', default: 0 })
  total_unpaid_break: number;

  @Column({ type: 'decimal', precision: 8, scale: 2, name: 'total_day_wise_total_hours', default: 0 })
  total_day_wise_total_hours: number;

}
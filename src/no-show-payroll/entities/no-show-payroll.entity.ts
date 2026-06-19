import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm'

@Entity('no_show_payroll')
@Index(['student_name', 'date_of_btw', 'btw_start_time', 'instructor'], { unique: true })
export class NoShowPayroll {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column({ type: 'varchar', length: 255 })
  student_name: string

  @Column({ type: 'date' })
  date_of_btw: string

  @Column({ type: 'text', nullable: true })
  btw_product: string | null

  @Column({ type: 'decimal', precision: 6, scale: 2, nullable: true })
  number_of_hours: number | null

  @Column({ type: 'decimal', precision: 6, scale: 2, nullable: true })
  paid_hours: number | null

  @Column({ type: 'varchar', length: 100, nullable: true })
  status: string | null

  @Column({ type: 'varchar', length: 255 })
  instructor: string

  @Column({ type: 'varchar', length: 255, nullable: true })
  location: string | null

  @Column({ type: 'varchar', length: 20, nullable: true })
  btw_start_time: string | null

  @Column({ type: 'varchar', length: 20, nullable: true })
  btw_end_time: string | null

  @Column({ type: 'varchar', length: 255, nullable: true })
  late_cancellation_via: string | null

  @Column({ type: 'varchar', length: 255, nullable: true })
  logged_in_user: string | null

  @Column({ type: 'varchar', length: 50, nullable: true })
  appt_id: string | null

  @Column({ type: 'varchar', length: 50, nullable: true })
  student_id: string | null

  @Column({ type: 'varchar', length: 50, nullable: true })
  student_cell: string | null

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  account_balance: number | null

  @Column({ type: 'text', nullable: true })
  service_package: string | null

  @Column({ type: 'varchar', length: 100, nullable: true })
  component_type: string | null

  @Column({ type: 'varchar', length: 100, nullable: true })
  appointment_full_datetime: string | null

  @Column({ type: 'text', nullable: true })
  student_notes: string | null

  @Column({ type: 'text', nullable: true })
  appointment_notes: string | null

  @CreateDateColumn({ type: 'timestamp with time zone' })
  created_at: Date

  @UpdateDateColumn({ type: 'timestamp with time zone' })
  updated_at: Date
}

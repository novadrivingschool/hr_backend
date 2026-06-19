import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm'

@Entity('assignment_payroll')
@Index(['student_name', 'date_of_btw', 'btw_start_time', 'instructor'], { unique: true })
export class AssignmentPayroll {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column({ type: 'varchar', length: 255 })
  student_name: string

  @Column({ type: 'text', nullable: true })
  type: string | null

  @Column({ type: 'text', nullable: true })
  package: string | null

  @Column({ type: 'date' })
  date_of_btw: string

  @Column({ type: 'varchar', length: 20, nullable: true })
  btw_start_time: string | null

  @Column({ type: 'varchar', length: 20, nullable: true })
  btw_end_time: string | null

  @Column({ type: 'decimal', precision: 6, scale: 2, nullable: true })
  number_of_hours: number | null

  @Column({ type: 'varchar', length: 255 })
  instructor: string

  @Column({ type: 'varchar', length: 100, nullable: true })
  status: string | null

  @Column({ type: 'varchar', length: 255, nullable: true })
  location: string | null

  @Column({ type: 'text', nullable: true })
  student_notes: string | null

  @Column({ type: 'varchar', length: 255, nullable: true })
  assigned: string | null

  @CreateDateColumn({ type: 'timestamp with time zone' })
  created_at: Date

  @UpdateDateColumn({ type: 'timestamp with time zone' })
  updated_at: Date
}

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm'

@Entity('teacher_payroll')
@Index(['teacher', 'session_date', 'session_start_time', 'cr_number'], { unique: true })
export class TeacherPayroll {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column({ type: 'varchar', length: 255 })
  teacher: string

  @Column({ type: 'varchar', length: 150, nullable: true })
  cr_number: string | null

  @Column({ type: 'text', nullable: true })
  type_of_cr_product: string | null

  @Column({ type: 'date' })
  session_date: string

  @Column({ type: 'varchar', length: 20, nullable: true })
  session_start_time: string | null

  @Column({ type: 'varchar', length: 20, nullable: true })
  session_end_time: string | null

  @Column({ type: 'varchar', length: 255, nullable: true })
  location: string | null

  @Column({ type: 'varchar', length: 50, nullable: true })
  session_number: string | null

  @Column({ type: 'varchar', length: 100, nullable: true })
  cr_status: string | null

  @Column({ type: 'decimal', precision: 6, scale: 2, nullable: true })
  number_of_hours: number | null

  @CreateDateColumn({ type: 'timestamp with time zone' })
  created_at: Date

  @UpdateDateColumn({ type: 'timestamp with time zone' })
  updated_at: Date
}

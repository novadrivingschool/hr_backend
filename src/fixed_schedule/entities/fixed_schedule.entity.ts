import { EmployeeSchedule } from 'src/employee_schedule/entities/employee_schedule.entity';
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { CustomerEnum } from 'src/schedule_event/entities/customer.enum';

@Entity('fixed_schedule')
export class FixedSchedule {
  @PrimaryGeneratedColumn()
  id: number;

  @Column('int', { array: true })
  weekdays: number[];

  @Column({ type: 'time' })
  start: string;

  @Column({ type: 'time' })
  end: string;

  @Column()
  register: string;

  @ManyToOne(() => EmployeeSchedule, schedule => schedule.fixed, { onDelete: 'CASCADE' })
  schedule: EmployeeSchedule;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  location: string[];

  @Column({ type: 'varchar', nullable: true, default: null })
  services: string | null;

  @Column({ type: 'varchar', nullable: true, default: null })
  restrictions: string | null;

  @Column({ type: 'varchar', nullable: true, default: null })
  vehicle_drop: string | null;

  @Column({ type: 'boolean', default: false })
  strict: boolean;

  @CreateDateColumn({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  updated_at: Date;

  @Column({ type: 'text', nullable: true, default: null })
  notes: string | null;

  @Column({ type: 'date' })
  start_date: string;

  @Column({ type: 'date', nullable: true, default: null })
  end_date: string | null;

  @Column({ type: 'varchar', nullable: true, default: null })
  customer: CustomerEnum | null;
}
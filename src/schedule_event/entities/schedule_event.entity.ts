import { EmployeeSchedule } from 'src/employee_schedule/entities/employee_schedule.entity';
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { RegisterEnum } from './register.enum';

type MakeUpScheduleItem = {
  date: string;
  start: string;
  end: string;
  location: string[];
  strict: boolean;
};

export type ApprovalRecord = {
  approved_by: string;
  employee_number: string;
  approved_at: string;
};

@Entity('schedule_event')
export class ScheduleEvent {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'enum', enum: RegisterEnum, enumName: 'schedule_event_register' })
  register: RegisterEnum;

  @Column({ type: 'date' })
  date: string;

  @Column({ type: 'timestamp', nullable: true, default: null })
  start: string | null;

  @Column({ type: 'timestamp', nullable: true, default: null })
  end: string | null;

  @ManyToOne(() => EmployeeSchedule, schedule => schedule.events, { onDelete: 'CASCADE' })
  schedule: EmployeeSchedule;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  location: string[];

  @Column({ type: 'varchar', nullable: true, default: null })
  services: string | null;

  @Column({ type: 'varchar', nullable: true, default: null })
  restrictions: string | null;

  @Column({ type: 'varchar', nullable: true, default: null })
  vehicle_drop: string | null;

  @Column({ type: 'uuid', nullable: true, default: null })
  uuid_tor: string | null;

  @Column({ type: 'uuid', nullable: true, default: null })
  uuid_extra_hours: string | null;

  @Column({ type: 'boolean', default: false })
  strict: boolean;

  @Column({ type: 'boolean', nullable: true, default: null })
  is_paid: boolean | null;

  @Column({ type: 'boolean', nullable: true, default: null })
  will_make_up_hours: boolean | null;

  @Column({ type: 'jsonb', nullable: true, default: null })
  make_up_schedule: MakeUpScheduleItem[] | null;

  @CreateDateColumn({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  updated_at: Date;

  @Column({ type: 'text', nullable: true, default: null })
  notes: string | null;

  @Column({ type: 'varchar', nullable: true, default: null })
  reason: string | null;

  @Column({ type: 'jsonb', nullable: true, default: null })
  approval_1: ApprovalRecord | null;

  @Column({ type: 'jsonb', nullable: true, default: null })
  approval_2: ApprovalRecord | null;
}
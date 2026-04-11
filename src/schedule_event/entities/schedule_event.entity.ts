/* src\schedule_event\entities\schedule_event.entity.ts */
import { EmployeeSchedule } from 'src/employee_schedule/entities/employee_schedule.entity';
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
} from 'typeorm';
import { RegisterEnum } from './register.enum';

type MakeUpScheduleItem = {
  date: string;
  start: string;
  end: string;
  location: string[];
  strict: boolean;
};

@Entity('schedule_event')
export class ScheduleEvent {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'enum', enum: RegisterEnum, enumName: 'schedule_event_register' })
  register: RegisterEnum;

  @Column({ type: 'date' })
  date: string;

  /* @Column({ type: 'timestamp' })
  start: string;

  @Column({ type: 'timestamp' })
  end: string; */
  @Column({ type: 'timestamp', nullable: true, default: null })
  start: string | null;

  @Column({ type: 'timestamp', nullable: true, default: null })
  end: string | null;

  @ManyToOne(() => EmployeeSchedule, schedule => schedule.events, { onDelete: 'CASCADE' })
  schedule: EmployeeSchedule;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  location: string[];

  @Column({ type: 'uuid', nullable: true, default: null })
  uuid_tor: string | null;

  @Column({ type: 'uuid', nullable: true, default: null })
  uuid_extra_hours: string | null;

  @Column({ type: 'boolean', default: false })
  strict: boolean;

  // Solo para register === TIME_OFF_REQUEST
  @Column({ type: 'boolean', nullable: true, default: null })
  is_paid: boolean | null;

  @Column({ type: 'boolean', nullable: true, default: null })
  will_make_up_hours: boolean | null;

  @Column({ type: 'jsonb', nullable: true, default: null })
  make_up_schedule: MakeUpScheduleItem[] | null;
}
import { EmployeeSchedule } from 'src/employee_schedule/entities/employee_schedule.entity';
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne
} from 'typeorm';
import { RegisterEnum } from './register.enum';


@Entity('schedule_event')
export class ScheduleEvent {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'enum', enum: RegisterEnum, enumName: 'schedule_event_register' })
  register: RegisterEnum;

  @Column({ type: 'date' })
  date: string;

  @Column({ type: 'timestamp' })
  start: string;

  @Column({ type: 'timestamp' })
  end: string;

  @ManyToOne(() => EmployeeSchedule, schedule => schedule.events, { onDelete: 'CASCADE' })
  schedule: EmployeeSchedule;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  location: string[];

  @Column({ type: 'uuid', nullable: true, default: null })
  uuid_tor: string | null;

  @Column({ type: 'uuid', nullable: true, default: null })
  uuid_extra_hours: string | null;
}

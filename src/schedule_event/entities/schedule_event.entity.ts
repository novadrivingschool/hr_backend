import { EmployeeSchedule } from 'src/employee_schedule/entities/employee_schedule.entity';
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne
} from 'typeorm';


@Entity('schedule_event')
export class ScheduleEvent {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  register: string;

  @Column({ type: 'date' })
  date: string;

  @Column({ type: 'timestamp' })
  start: string;

  @Column({ type: 'timestamp' })
  end: string;

  @ManyToOne(() => EmployeeSchedule, schedule => schedule.events, { onDelete: 'CASCADE' })
  schedule: EmployeeSchedule;

  /* @Column()
  location: string; */
  @Column({ type: 'jsonb', default: () => "'[]'" })
  location: string[];
}

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToMany,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { FixedSchedule } from 'src/fixed_schedule/entities/fixed_schedule.entity';
import { ScheduleEvent } from 'src/schedule_event/entities/schedule_event.entity';

@Entity('employee_schedule')
export class EmployeeSchedule {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  employee_number: string;

  @OneToMany(() => FixedSchedule, fixed => fixed.schedule, { cascade: true, eager: true })
  fixed: FixedSchedule[];

  @OneToMany(() => ScheduleEvent, event => event.schedule, { cascade: true, eager: true })
  events: ScheduleEvent[];

  @CreateDateColumn({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  updated_at: Date;
}
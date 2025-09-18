import { EmployeeSchedule } from 'src/employee_schedule/entities/employee_schedule.entity';
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne
} from 'typeorm';


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

  /* @Column()
  location: string; */
  @Column({ type: 'jsonb', default: () => "'[]'" })
  location: string[];
}

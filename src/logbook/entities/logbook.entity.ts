import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';
import { EmployeeData } from '../interfaces/logbook-data.interfaces';


@Entity('logbook_entries')
export class Logbook {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'jsonb' })
  employee_data: EmployeeData;

  @Column()
  section: string;

  @Column({ type: 'jsonb' })
  data: Record<string, any>; // Se usará con los tipos definidos en las interfaces por sección

  @CreateDateColumn()
  created_at: Date;
}

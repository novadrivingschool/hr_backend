import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

@Entity('logbook_entries')
export class Logbook {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'jsonb' })
  employee_data: {
    name: string;
    last_name: string;
    employee_number: string;
    department: string;
    country: string;
    company: string;
  };

  @Column()
  section: string;

  @Column({ type: 'jsonb' })
  data: Record<string, any>; // Se usará con los tipos definidos en las interfaces por sección

  @CreateDateColumn()
  created_at: Date;
}

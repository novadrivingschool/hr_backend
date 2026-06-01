import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('employee_rate_history')
export class EmployeeRateHistory {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 50 })
  employee_number: string;

  @Column({ type: 'float' })
  rate: number;

  @Column({ type: 'varchar', length: 20 })
  season: string;

  @Column({ type: 'date' })
  start_date: string;

  @Column({ type: 'date', nullable: true })
  end_date: string | null;

  @Column({ type: 'varchar', length: 500, default: '' })
  notes: string;

  @CreateDateColumn()
  created_at: Date;

  @Column({ type: 'varchar', length: 100, default: '' })
  created_by: string;
}

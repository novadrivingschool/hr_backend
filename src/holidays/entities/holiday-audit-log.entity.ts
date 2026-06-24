import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

@Entity('holiday_audit_log')
export class HolidayAuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ nullable: true })
  holiday_id: string;

  @Column()
  holiday_name: string;

  @Column()
  action: string; // 'created' | 'updated' | 'deleted' | 'activated' | 'deactivated'

  @Column({ nullable: true })
  performed_by_name: string;

  @Column({ nullable: true })
  performed_by_employee_number: string;

  @Column({ type: 'jsonb', nullable: true })
  changes: Record<string, any>; // { before: {...}, after: {...} }

  @CreateDateColumn()
  created_at: Date;
}

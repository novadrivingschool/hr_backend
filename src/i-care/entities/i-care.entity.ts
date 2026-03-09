import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('i_care')
export class ICare {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  urgency: string;

  @Column()
  date: string;

  @Column('jsonb')
  submitter: {
    name: string;
    last_name: string;
    employee_number: string;
    nova_email: string;
  };

  @Column('jsonb', { nullable: true })
  staff_name: {
    name: string;
    last_name: string;
    employee_number: string;
    nova_email: string;
  } | null;

  @Column('jsonb', { nullable: true })
  responsible: Array<{
    name: string;
    last_name: string;
    employee_number: string;
    nova_email: string;
  }> | null;

  @Column({ nullable: true })
  department: string;

  @Column('jsonb', { nullable: true, default: () => "'[]'" })
  staffType: string[];

  @Column('jsonb', { nullable: true, default: () => "'[]'" })
  multi_position: string[];

  @Column()
  reason: string;

  @Column('text')
  details: string;

  @Column({ nullable: true })
  dnAccountLink: string;

  @Column({ nullable: true })
  accountPhone: string;

  @Column('jsonb', { nullable: true })
  attachments: any[];

  // ─── Commitment fields ───────────────────────────────────────────────────────

  /**
   * Whether the staff member has committed to not repeating the infraction.
   * Defaults to false.
   */
  @Column({ type: 'boolean', default: false })
  committed: boolean;

  /**
   * Date when the commitment was made (ISO date string, e.g. "2025-07-15").
   */
  @Column({ nullable: true, type: 'varchar', length: 20 })
  committed_date: string | null;

  /**
   * Time when the commitment was made (24-h string, e.g. "14:35").
   */
  @Column({ nullable: true, type: 'varchar', length: 10 })
  committed_time: string | null;

  /**
   * Free-text notes the staff member wrote as part of their commitment.
   */
  @Column({ type: 'text', nullable: true })
  committed_notes: string | null;

  // ────────────────────────────────────────────────────────────────────────────

  @CreateDateColumn({ type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
  updatedAt: Date;
}
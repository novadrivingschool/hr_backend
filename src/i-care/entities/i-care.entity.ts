import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum ICareStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  SOLVED = 'solved',
}

export enum ICareUrgency {
  LOW = 'Low',
  MEDIUM = 'Medium',
  HIGH = 'High',
  CRITICAL = 'Critical',
}

@Entity('i_care')
export class ICare {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    type: 'enum',
    enum: ICareUrgency,
    default: ICareUrgency.LOW,
  })
  urgency: ICareUrgency;

  @Column()
  date: string;

  @Column('jsonb')
  submitter: {
    name: string;
    last_name: string;
    employee_number: string;transformDates
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

  // ─── Status ────────────────────────────────────────────────────────────────

  @Column({
    type: 'enum',
    enum: ICareStatus,
    default: ICareStatus.PENDING,
  })
  status: ICareStatus;

  // ─── Commitment fields ─────────────────────────────────────────────────────

  @Column({ type: 'boolean', default: false })
  committed: boolean;

  @Column({ nullable: true, type: 'varchar', length: 20 })
  committed_date: string | null;

  @Column({ nullable: true, type: 'varchar', length: 10 })
  committed_time: string | null;

  @Column({ type: 'text', nullable: true })
  committed_notes: string | null;

  @Column('jsonb', { nullable: true, default: () => "'[]'" })
  committed_attachments: string[];

  // ─── Justified fields ──────────────────────────────────────────────────────

  @Column({ type: 'boolean', default: false })
  justified: boolean;

  @Column('jsonb', { nullable: true })
  justified_approved_by: {
    name: string;
    last_name: string;
    employee_number: string;
    nova_email: string;
  } | null;

  @Column({ nullable: true, type: 'varchar', length: 20 })
  justified_date: string | null;

  @Column({ nullable: true, type: 'varchar', length: 10 })
  justified_time: string | null;

  @Column('jsonb', { nullable: true, default: () => "'[]'" })
  justified_comments: string[];

  @CreateDateColumn({ type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
  updatedAt: Date;

  // ─── Resolution fields ──────────────────────────────────────────────────────

  @Column('jsonb', { nullable: true })
  resolved_by: {
    name: string;
    last_name: string;
    employee_number: string;
    nova_email: string;
  } | null;

  @Column({ nullable: true, type: 'varchar', length: 20 })
  resolved_date: string | null;

  @Column({ nullable: true, type: 'varchar', length: 10 })
  resolved_time: string | null;

  @Column({ type: 'text', nullable: true })
  resolved_notes: string | null;
}
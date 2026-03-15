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
  REJECTED = 'rejected',
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

  // ─── Identificación ────────────────────────────────────────────────────────
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'enum', enum: ICareUrgency, default: ICareUrgency.LOW })
  urgency: ICareUrgency;

  @Column({ type: 'enum', enum: ICareStatus, default: ICareStatus.PENDING })
  status: ICareStatus;

  @Column()
  date: string;

  // ─── Personas involucradas ─────────────────────────────────────────────────
  /** Quien levantó el iCare */
  @Column('jsonb')
  submitter: {
    name: string;
    last_name: string;
    employee_number: string;
    nova_email: string;
  };

  /** Staff al que se le levantó el iCare */
  @Column('jsonb', { nullable: true })
  staff_name: {
    name: string;
    last_name: string;
    employee_number: string;
    nova_email: string;
  } | null;

  /** Responsables asignados para atender el caso */
  @Column('jsonb', { nullable: true })
  responsible: Array<{
    name: string;
    last_name: string;
    employee_number: string;
    nova_email: string;
  }> | null;

  // ─── Información del Staff afectado ───────────────────────────────────────
  /** Departamento del staff afectado */
  @Column({ nullable: true })
  department: string;

  /** Tipo(s) de staff afectado */
  @Column('jsonb', { nullable: true, default: () => "'[]'" })
  staffType: string[];

  /** Posiciones múltiples del staff afectado */
  @Column('jsonb', { nullable: true, default: () => "'[]'" })
  multi_position: string[];

  // ─── Detalles del reporte ──────────────────────────────────────────────────
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

  // ─── Justified fields ──────────────────────────────────────────────────────
  @Column({ type: 'boolean', default: false })
  justified: boolean;

  /** HR que aprobó la justificación */
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

  // ─── Resolution fields ─────────────────────────────────────────────────────
  /** HR que resolvió el caso */
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

  // ─── Timestamps ────────────────────────────────────────────────────────────
  @CreateDateColumn({ type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
  updatedAt: Date;
}
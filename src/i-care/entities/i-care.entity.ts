import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum ICareStatus {
  PENDING = 'pending',
  PENDING_CREATION_REVIEW = 'pending_creation_review',
  IN_PROGRESS = 'in_progress',
  PENDING_HR_REVIEW = 'pending_hr_review',
  REJECTION_UNDER_REVIEW = 'rejection_under_review',
  REJECTED = 'rejected',
  FOLLOWING_UP = 'following_up',
  COMMIT_FULFILLED = 'commit_fulfilled',
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

  @Column({ type: 'enum', enum: ICareUrgency, nullable: true, default: null })
  urgency: ICareUrgency | null;

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
    /** Embebido en creación si el staff tiene rol coordinator/coordinator-assistant/super-coordinator.
     *  No requiere migración — está dentro del JSONB existente. */
    is_coordinator?: boolean;
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

  // ─── Coordinator Escalation fields (snapshot inmutable: coordinator marcó
  // el caso como High/Critical y lo escaló a HR/Mgmt). Se setea UNA sola vez
  // dentro de justify() y nunca se vuelve a tocar, ni en el re-justify que
  // sigue a un downgrade — a diferencia de justified_*, que sí se pisa en
  // cada llamada a justify(). ────────────────────────────────────────────────
  @Column({ type: 'boolean', default: false })
  escalated: boolean;

  /** Coordinator que escaló el caso */
  @Column('jsonb', { nullable: true })
  escalated_by: {
    name: string;
    last_name: string;
    employee_number: string;
    nova_email: string;
    roles?: string[];
  } | null;

  @Column({ nullable: true, type: 'varchar', length: 20 })
  escalated_date: string | null;

  @Column({ nullable: true, type: 'varchar', length: 10 })
  escalated_time: string | null;

  /** Urgency con la que se escaló (High o Critical) */
  @Column({ nullable: true, type: 'varchar', length: 20 })
  escalated_urgency: string | null;

  @Column({ nullable: true, type: 'text' })
  escalated_comment: string | null;

  @Column('jsonb', { nullable: true, default: () => "'[]'" })
  escalated_attachments: string[];

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
    roles?: string[];
  } | null;

  @Column({ nullable: true, type: 'varchar', length: 20 })
  justified_date: string | null;

  @Column({ nullable: true, type: 'varchar', length: 10 })
  justified_time: string | null;

  @Column('jsonb', { nullable: true, default: () => "'[]'" })
  justified_comments: string[];

  @Column('jsonb', { nullable: true, default: () => "'[]'" })
  justified_attachments: string[];

  /** Evidencia subida por HR/Management al approve-justification */
  @Column('jsonb', { nullable: true, default: () => "'[]'" })
  hr_justified_attachments: string[];

  /** Notas de HR/Management al approve-justification (accept) */
  @Column({ nullable: true, type: 'text' })
  hr_justified_notes: string | null;

  // ─── Downgrade fields (HR/Mgmt baja H/C a Low/Medium, regresa a PENDING) ───
  @Column({ type: 'boolean', default: false })
  downgraded: boolean;

  /** HR/Management que hizo el downgrade */
  @Column('jsonb', { nullable: true })
  downgraded_by: {
    name: string;
    last_name: string;
    employee_number: string;
    nova_email: string;
    roles?: string[];
  } | null;

  @Column({ nullable: true, type: 'varchar', length: 20 })
  downgraded_date: string | null;

  @Column({ nullable: true, type: 'varchar', length: 10 })
  downgraded_time: string | null;

  /** Urgency original (High/Critical) antes del downgrade */
  @Column({ nullable: true, type: 'varchar', length: 20 })
  downgraded_from_urgency: string | null;

  @Column({ nullable: true, type: 'text' })
  downgraded_notes: string | null;

  @Column('jsonb', { nullable: true, default: () => "'[]'" })
  downgraded_attachments: string[];

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

  // ─── Commit Approval fields ────────────────────────────────────────────────
  /** Coordinator/HR que aprobó el commit del staff y asignó el primer seguimiento */
  @Column({ type: 'boolean', default: false })
  commit_approved: boolean;

  @Column('jsonb', { nullable: true })
  commit_approved_by: {
    name: string;
    last_name: string;
    employee_number: string;
    nova_email: string;
  } | null;

  @Column({ nullable: true, type: 'varchar', length: 20 })
  commit_approved_date: string | null;

  @Column({ nullable: true, type: 'varchar', length: 10 })
  commit_approved_time: string | null;

  // ─── Seguimientos (Follow-ups) ─────────────────────────────────────────────
  /**
   * Array de seguimientos asignados por el coordinator/HR.
   * Cada entrada: { id, scheduled_date, actual_date, notes, added_by, created_at }
   */
  @Column('jsonb', { nullable: true, default: () => "'[]'" })
  seguimientos: Array<{
    id: string;
    scheduled_date: string;
    actual_date: string | null;
    notes: string | null;
    added_by: {
      name: string;
      last_name: string;
      employee_number: string;
      nova_email: string;
    };
    created_at: string;
    attachments?: string[];
  }>;

  // ─── Commit Fulfilled fields ───────────────────────────────────────────────
  @Column({ type: 'boolean', default: false })
  commit_fulfilled: boolean;

  @Column('jsonb', { nullable: true })
  commit_fulfilled_by: {
    name: string;
    last_name: string;
    employee_number: string;
    nova_email: string;
  } | null;

  @Column({ nullable: true, type: 'varchar', length: 20 })
  commit_fulfilled_date: string | null;

  @Column({ nullable: true, type: 'varchar', length: 10 })
  commit_fulfilled_time: string | null;

  @Column({ type: 'text', nullable: true })
  commit_fulfilled_notes: string | null;

  @Column('jsonb', { nullable: true, default: () => "'[]'" })
  commit_fulfilled_attachments: string[];

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

  @Column('jsonb', { nullable: true, default: () => "'[]'" })
  resolved_attachments: string[];

  // ─── Coordinator Rejection fields ─────────────────────────────────────────
  /** Coordinator rechazó el iCare → status pasa a rejection_under_review */
  @Column({ type: 'boolean', default: false })
  coordinator_rejected: boolean;

  @Column('jsonb', { nullable: true })
  coordinator_rejected_by: {
    name: string;
    last_name: string;
    employee_number: string;
    nova_email: string;
  } | null;

  @Column({ nullable: true, type: 'varchar', length: 20 })
  coordinator_rejected_date: string | null;

  @Column({ nullable: true, type: 'varchar', length: 10 })
  coordinator_rejected_time: string | null;

  @Column({ type: 'text', nullable: true })
  coordinator_rejected_notes: string | null;

  @Column('jsonb', { nullable: true, default: () => "'[]'" })
  coordinator_rejected_attachments: string[];

  // ─── Creation Review fields (coordinator reporting own personnel) ─────────
  /** true = el submitter es supervisor/responsible del staff reportado (caso "propio personal") */
  @Column({ type: 'boolean', default: false })
  creation_review_required: boolean;

  /** true = HR/Management ya revisó la creación de este caso */
  @Column({ type: 'boolean', default: false })
  creation_reviewed: boolean;

  /** true = se aprobó la creación (vuelve a coordinator), false = se rechazó (REJECTED). null = aún no revisado.
   *  Se guarda por separado del status porque el status puede seguir cambiando después (justified, in_progress, etc.)
   *  y necesitamos poder mostrar el resultado de este stage en el historial sin importar el status actual. */
  @Column({ type: 'boolean', nullable: true })
  creation_review_approved: boolean | null;

  @Column('jsonb', { nullable: true })
  creation_reviewed_by: {
    name: string;
    last_name: string;
    employee_number: string;
    nova_email: string;
  } | null;

  @Column({ nullable: true, type: 'varchar', length: 20 })
  creation_review_date: string | null;

  @Column({ nullable: true, type: 'varchar', length: 10 })
  creation_review_time: string | null;

  @Column({ type: 'text', nullable: true })
  creation_review_notes: string | null;

  @Column('jsonb', { nullable: true, default: () => "'[]'" })
  creation_review_attachments: string[];

  // ─── Rejection Review fields (HR / Management) ─────────────────────────────
  /** true = HR/Mgmt ya revisó el rejected del coordinator */
  @Column({ type: 'boolean', default: false })
  rejection_reviewed: boolean;

  /** true = aceptaron el rejected (status → rejected final) | false = override (status → pending) */
  @Column({ type: 'boolean', nullable: true })
  rejection_review_accepted: boolean | null;

  /** Si override=true el coordinator no puede volver a rechazar */
  @Column({ type: 'boolean', default: false })
  rejection_override: boolean;

  @Column('jsonb', { nullable: true })
  rejection_reviewed_by: {
    name: string;
    last_name: string;
    employee_number: string;
    nova_email: string;
  } | null;

  @Column({ nullable: true, type: 'varchar', length: 20 })
  rejection_review_date: string | null;

  @Column({ nullable: true, type: 'varchar', length: 10 })
  rejection_review_time: string | null;

  @Column({ type: 'text', nullable: true })
  rejection_review_notes: string | null;

  @Column('jsonb', { nullable: true, default: () => "'[]'" })
  rejection_review_attachments: string[];

  // ─── Timestamps ────────────────────────────────────────────────────────────
  @CreateDateColumn({ type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
  updatedAt: Date;
}

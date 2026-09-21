import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Snapshot de una persona embebido en el acuerdo — mismo criterio que
 * PersonDto en i-care (src/i-care/dto/create-i-care.dto.ts): no se
 * referencia por FK a Employee, se copia el dato al momento de
 * crear/editar para que el histórico no cambie si el empleado cambia de
 * nombre/depto/posición después.
 */
export interface AgreementPerson {
  name: string;
  last_name: string;
  employee_number: string;
  nova_email: string;
}

export interface AgreementEmployee extends AgreementPerson {
  /**
   * Informativos -- snapshot de TODAS las posiciones/departamentos del
   * empleado al momento de crear el acuerdo (un empleado puede tener mas
   * de uno, ver Employee.multi_position / multi_department). No son
   * editables desde el form de Agreement, solo se muestran como contexto.
   */
  multi_position: string[];
  multi_department: string[];
}

export interface AgreementNote {
  id: string;
  note: string;
  added_by: AgreementPerson;
  created_at: string;
}

@Entity('agreements')
export class Agreement {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Empleado con quien se firma el acuerdo (posición/depto al momento de crearlo) */
  @Column('jsonb')
  employee: AgreementEmployee;

  /** Responsable de dar seguimiento al acuerdo */
  @Column('jsonb')
  responsible: AgreementPerson;

  /** Fecha en que el acuerdo empieza a ser efectivo */
  @Column({ type: 'date' })
  start_date: string;

  /** Fecha final — opcional, acuerdo indefinido si no se especifica */
  @Column({ type: 'date', nullable: true, default: null })
  end_date: string | null;

  @Column({ type: 'text' })
  reason: string;

  /** Historial de notas — append-only, ver AgreementService.addNote() */
  @Column('jsonb', { default: () => "'[]'" })
  notes: AgreementNote[];

  /** Keys de S3 (imágenes/PDF) — mismo patrón que i_care.attachments */
  @Column('jsonb', { default: () => "'[]'" })
  attachments: string[];

  /** Quién creó el acuerdo (localStorage data_employee en el front) */
  @Column('jsonb', { nullable: true, default: null })
  created_by: AgreementPerson | null;

  @CreateDateColumn({ type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
  updatedAt: Date;

  /**
   * Soft delete -- un acuerdo es un registro con valor legal/de cumplimiento,
   * nunca se borra físicamente. `remove()` en el service solo marca estos dos
   * campos; findAll/findOne excluyen todo registro con deletedAt != null.
   */
  @Column({ type: 'timestamptz', nullable: true, default: null })
  deletedAt: Date | null;

  /** Quién lo archivó -- mismo snapshot que created_by, ver AgreementPerson. */
  @Column('jsonb', { nullable: true, default: null })
  deletedBy: AgreementPerson | null;
}

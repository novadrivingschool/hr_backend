import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import {
  CandidateSourceEnum,
  CandidateStatusEnum,
  CandidateResultEnum,
  EnglishInterviewResultEnum,
  InterviewTypeEnum,
  EmploymentTypeEnum,
} from '../enums';

/**
 * Respalda el modulo HR Candidate Tracker — reemplaza el Excel
 * "Template_HR Candidate Tracker.xlsx" que HR llevaba manualmente.
 *
 * `recruiter` queda como texto libre a proposito (decision de Javier,
 * 2026-09-18): hoy son 2-3 personas y todavia no vale la pena una tabla
 * catalogo ni un vinculo a `employees`. Si el equipo de reclutamiento crece,
 * se puede migrar a un catalogo editable sin romper el historico (el texto
 * ya cargado queda igual).
 *
 * `attachments` guarda solo las S3 keys (mismo patron que `office_supplies`
 * y `leave_of_absence`), devueltas por aws_services_backend
 * (`/candidate-tracker/files/upload` — ver CandidateTrackerFilesModule).
 */
@Entity('candidate_trackers')
export class CandidateTracker {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'varchar', length: 160 })
  candidateName: string;

  @Column({ type: 'varchar', length: 160, nullable: true })
  position: string | null;

  @Index()
  @Column({ type: 'varchar', length: 120, nullable: true })
  recruiter: string | null;

  @Index()
  @Column({ type: 'enum', enum: CandidateSourceEnum, enumName: 'candidate_tracker_source', nullable: true })
  source: CandidateSourceEnum | null;

  /** Codigo de pais del telefono (ej. "+1", "+52"), separado del numero. */
  @Column({ type: 'varchar', length: 6, nullable: true, default: '+1' })
  phoneCountryCode: string | null;

  /** Formato (xxx) xxx-xxxx, aplicado en el frontend. */
  @Column({ type: 'varchar', length: 40, nullable: true })
  phoneNumber: string | null;

  @Column({ type: 'varchar', length: 160, nullable: true })
  email: string | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  countryAddress: string | null;

  @Column({ type: 'boolean', default: false })
  driversLicense: boolean;

  @Column({ type: 'boolean', default: false })
  englishTestPassed: boolean;

  @Column({ type: 'boolean', default: false })
  personalityTestPassed: boolean;

  @Column({ type: 'boolean', default: false })
  typingTestPassed: boolean;

  @Column({
    type: 'enum',
    enum: EnglishInterviewResultEnum,
    enumName: 'candidate_tracker_english_interview_result',
    nullable: true,
  })
  englishInterview: EnglishInterviewResultEnum | null;

  @Column({ type: 'enum', enum: InterviewTypeEnum, enumName: 'candidate_tracker_interview_type', nullable: true })
  interviewType: InterviewTypeEnum | null;

  @Column({ type: 'enum', enum: EmploymentTypeEnum, enumName: 'candidate_tracker_employment_type', nullable: true })
  employmentType: EmploymentTypeEnum | null;

  @Column({ type: 'text', nullable: true })
  interviewFeedback: string | null;

  @Index()
  @Column({
    type: 'enum',
    enum: CandidateStatusEnum,
    enumName: 'candidate_tracker_status',
    default: CandidateStatusEnum.ToContact,
  })
  status: CandidateStatusEnum;

  @Index()
  @Column({ type: 'enum', enum: CandidateResultEnum, enumName: 'candidate_tracker_result', nullable: true })
  result: CandidateResultEnum | null;

  @Column({ type: 'text', nullable: true })
  observations: string | null;

  @Column({ type: 'jsonb', default: [] })
  attachments: string[];

  @Column({ type: 'varchar', length: 40, nullable: true })
  createdByEmployeeNumber: string | null;

  @Column({ type: 'varchar', length: 160, nullable: true })
  createdByName: string | null;

  @CreateDateColumn({ type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
  updatedAt: Date;

  /**
   * Soft delete -- mismo patron que AgreementEntity (ver
   * agreement/entities/agreement.entity.ts): remove() en el service nunca
   * borra fisico, solo marca estos tres campos. findAll/findOne excluyen
   * todo registro con deletedAt != null, pero el historial de reclutamiento
   * queda intacto en la base para auditoria.
   */
  @Column({ type: 'timestamptz', nullable: true, default: null })
  deletedAt: Date | null;

  @Column({ type: 'varchar', length: 40, nullable: true, default: null })
  deletedByEmployeeNumber: string | null;

  @Column({ type: 'varchar', length: 160, nullable: true, default: null })
  deletedByName: string | null;
}

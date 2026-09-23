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
  CandidateFinalResultEnum,
  EnglishInterviewResultEnum,
  InterviewTypeEnum,
  EmploymentTypeEnum,
  ContactAttemptEnum,
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

  /** Sucursal/ubicacion de la posicion (catalogo `locations`, servido por
   * locations_service -- misma base de datos que hr_backend). Texto libre,
   * no FK -- mismo criterio que `department` (ver comentario de la
   * migracion 1790018053150-AddDepartmentToCandidateTrackers). Dejo de ser
   * un enum fijo en la migracion
   * 1791000000000-ConvertCandidateTrackerLocationAndTypeOfStaffToVarchar:
   * los valores de LocationEnum (ver ../enums.ts, ya eliminado) eran
   * inventados y no correspondian al catalogo real. El frontend puebla el
   * select consultando `GET /location` (locations_service) en vivo. */
  @Index()
  @Column({ type: 'varchar', length: 160, nullable: true })
  location: string | null;

  /** Categoria funcional del puesto (catalogo `type_of_staffs`, ver
   * TypeOfStaffModule en hr_backend). Texto libre, no FK -- mismo criterio
   * que `location` arriba. No es lo mismo que `employmentType`
   * (Full-Time/Part-Time). Dejo de ser un enum fijo en la migracion
   * 1791000000000-ConvertCandidateTrackerLocationAndTypeOfStaffToVarchar
   * (ver comentario de `location`). El frontend puebla el select
   * consultando `GET /type-of-staff` en vivo. */
  @Index()
  @Column({ type: 'varchar', length: 160, nullable: true })
  typeOfStaff: string | null;

  /** Nombre del departamento (catalogo `departments`, ver DepartmentsModule).
   * Texto libre, no FK -- mismo criterio que `recruiter` (ver comentario de
   * la migracion 1790018053150-AddDepartmentToCandidateTrackers). El
   * frontend puebla el select consultando GET /departments en vivo, nunca
   * una lista fija como source/status/result. */
  @Column({ type: 'varchar', length: 120, nullable: true })
  department: string | null;

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

  /** Seccion "Contact Attempt" del formulario, arriba de Screening -- ver
   * ContactAttemptEnum en ../enums.ts para el detalle de cada opcion. */
  @Index()
  @Column({
    type: 'enum',
    enum: ContactAttemptEnum,
    enumName: 'candidate_tracker_contact_attempt',
    nullable: true,
  })
  contactAttempt: ContactAttemptEnum | null;

  @Column({ type: 'text', nullable: true })
  contactAttemptNotes: string | null;

  @Column({ type: 'boolean', default: false })
  driversLicense: boolean;

  @Column({ type: 'boolean', default: false })
  englishTestPassed: boolean;

  @Column({ type: 'boolean', default: false })
  personalityTestPassed: boolean;

  @Column({ type: 'boolean', default: false })
  typingTestPassed: boolean;

  /** Screening adicional pedido por Javier (IT), 2026-09-21 -- mismo patron
   * que driversLicense/englishTestPassed/etc. arriba: checkbox simple, sin
   * catalogo. */
  @Column({ type: 'boolean', default: false })
  ageVerified: boolean;

  @Column({ type: 'boolean', default: false })
  diplomaTranscript: boolean;

  @Column({ type: 'boolean', default: false })
  twentyOnePlus: boolean;

  @Column({ type: 'boolean', default: false })
  backgroundCheckPassed: boolean;

  @Column({ type: 'boolean', default: false })
  psychometricTestPassed: boolean;

  @Column({ type: 'boolean', default: false })
  noAtFaultAccident: boolean;

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

  /** Fecha en que se agenda/realiza la entrevista -- independientes de
   * `status` (que es un solo valor de pipeline, no un log de eventos).
   * Alimentan los KPIs semanales de reclutamiento (Entrevistas programadas /
   * realizadas y Tasa de No-show). Se marcan a mano desde el panel.
   *
   * Tipo `date` (calendario puro, sin hora ni zona) a proposito -- ver
   * 1790700000000-ConvertCandidateTrackerInterviewDatesToDateOnly.ts.
   * TypeORM+pg devuelven una columna `date` como string "YYYY-MM-DD", que
   * es exactamente lo que el v-date-picker del frontend manda y espera. */
  @Column({ type: 'date', nullable: true, default: null })
  interviewScheduledAt: string | null;

  @Column({ type: 'date', nullable: true, default: null })
  interviewCompletedAt: string | null;

  @Index()
  @Column({
    type: 'enum',
    enum: CandidateStatusEnum,
    enumName: 'candidate_tracker_status',
    default: CandidateStatusEnum.ToContact,
  })
  status: CandidateStatusEnum;

  /** Resultado de la entrevista de HR -- vive en la seccion "Interview"
   * del formulario (ver comentario de CandidateFinalResultEnum en enums.ts
   * para como se relaciona con inPersonInterviewResult/finalResult). */
  @Index()
  @Column({ type: 'enum', enum: CandidateResultEnum, enumName: 'candidate_tracker_result', nullable: true })
  result: CandidateResultEnum | null;

  /** Seccion "In-Person Interview" propia, despues de Interview en el
   * formulario -- pedido por Javier (IT) 2026-09-22, no es mandatory.
   * Reusa el mismo enum/tipo Postgres que `result` (Passed/Failed): es el
   * resultado de la entrevista presencial, independiente del resultado de
   * la entrevista de HR (`result` arriba). */
  @Column({ type: 'enum', enum: CandidateResultEnum, enumName: 'candidate_tracker_result', nullable: true })
  inPersonInterviewResult: CandidateResultEnum | null;

  @Column({ type: 'text', nullable: true })
  inPersonInterviewNotes: string | null;

  /** Resultado definitivo del proceso completo, seccion propia al final del
   * formulario -- ver comentario de CandidateFinalResultEnum en enums.ts. */
  @Index()
  @Column({
    type: 'enum',
    enum: CandidateFinalResultEnum,
    enumName: 'candidate_tracker_final_result',
    nullable: true,
  })
  finalResult: CandidateFinalResultEnum | null;

  /** Notas generales del candidato -- NO exclusivas de In-Person Interview.
   * Relabeled 2026-09-22: el campo/columna no cambio, solo el label en el
   * frontend volvio a "Observations" (antes decia "In Person Interview
   * Notes" por error; las notas propias de esa entrevista ahora viven en
   * `inPersonInterviewNotes`, arriba). */
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

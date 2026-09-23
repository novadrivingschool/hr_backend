import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { CandidateTracker } from './candidate-tracker.entity';

/**
 * Lista completa de campos trackeados por el log -- ver TRACKED_FIELDS en
 * candidate-tracker.service.ts (fuente de la verdad, este type solo la
 * refleja para tipar la columna `field`). Si se agrega un campo nuevo a
 * trackear, agregarlo en AMBOS lugares.
 */
export type CandidateTrackerHistoryField =
  | 'status'
  | 'result'
  | 'inPersonInterviewResult'
  | 'inPersonInterviewNotes'
  | 'finalResult'
  | 'contactAttempt'
  | 'recruiter'
  | 'department'
  | 'source'
  | 'position'
  | 'location'
  | 'typeOfStaff'
  | 'employmentType'
  | 'interviewType'
  | 'englishInterview'
  | 'phoneNumber'
  | 'email'
  | 'interviewScheduledAt'
  | 'interviewCompletedAt'
  | 'observations'
  | 'interviewFeedback'
  | 'contactAttemptNotes'
  | 'driversLicense'
  | 'englishTestPassed'
  | 'personalityTestPassed'
  | 'typingTestPassed'
  | 'ageVerified'
  | 'diplomaTranscript'
  | 'twentyOnePlus'
  | 'backgroundCheckPassed'
  | 'psychometricTestPassed'
  | 'noAtFaultAccident';

/**
 * Bitacora de auditoria de un candidato -- CandidateTrackerService inserta
 * una fila aca cada vez que create()/update() detectan que alguno de los
 * campos de TRACKED_FIELDS realmente cambio (nunca en cada update de
 * cualquier otro campo suelto que no este en esa lista). Generalizada
 * 2026-09-22 (Javier): originalmente solo cubria status/result: ver
 * 1790500000000-WidenCandidateTrackerHistoryColumns.ts para el motivo de
 * por que el nombre de la tabla se quedo igual aunque ahora trackea mucho
 * mas que "status". Habilita analytics con evolucion real en el tiempo
 * (CandidateTrackerAnalytics.vue: "Pipeline over time", "Avg days to
 * Hire") y el timeline de actividad en el Preview del frontend, en vez de
 * solo la foto del estado actual de `candidate_trackers`.
 *
 * Un candidato ya existente al momento de desplegar este feature (o de
 * agregar un campo nuevo a TRACKED_FIELDS) no tiene historial previo de ese
 * campo -- no hay forma de reconstruir retroactivamente. El historial
 * arranca desde el primer cambio real que ocurra despues del deploy.
 */
@Entity('candidate_tracker_status_history')
export class CandidateTrackerStatusHistory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  candidateId: string;

  @ManyToOne(() => CandidateTracker, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'candidateId' })
  candidate: CandidateTracker;

  @Index()
  @Column({ type: 'varchar', length: 40 })
  field: CandidateTrackerHistoryField;

  /** null cuando el campo no tenia valor antes (ej. al crear el candidato,
   * o la primera vez que se le asigna un valor a un campo opcional). Es
   * `text` (no varchar) porque tambien guarda el contenido completo de
   * observations/interviewFeedback/contactAttemptNotes, que pueden ser
   * parrafos largos. */
  @Column({ type: 'text', nullable: true })
  previousValue: string | null;

  @Column({ type: 'text', nullable: true })
  newValue: string | null;

  @Index()
  @CreateDateColumn({ type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
  changedAt: Date;

  @Column({ type: 'varchar', length: 40, nullable: true })
  changedByEmployeeNumber: string | null;

  @Column({ type: 'varchar', length: 160, nullable: true })
  changedByName: string | null;
}

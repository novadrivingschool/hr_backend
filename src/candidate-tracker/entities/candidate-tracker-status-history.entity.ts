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

export type CandidateTrackerHistoryField = 'status' | 'result';

/**
 * Bitacora de cambios de status/result de un candidato -- CandidateTrackerService
 * inserta una fila aca cada vez que create()/update() detectan que alguno
 * de los dos campos realmente cambio (nunca en cada update de cualquier
 * otro campo). Habilita analytics con evolucion real en el tiempo
 * (CandidateTrackerAnalytics.vue: "Pipeline over time", "Avg days to
 * Hire") y el timeline de actividad en el Preview del frontend, en vez de
 * solo la foto del estado actual de `candidate_trackers`.
 *
 * Un candidato ya existente al momento de desplegar este feature no tiene
 * historial previo -- no hay forma de reconstruir retroactivamente por
 * que status paso antes de esto. El historial arranca desde el primer
 * cambio real que ocurra despues del deploy.
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
  @Column({ type: 'varchar', length: 10 })
  field: CandidateTrackerHistoryField;

  /** null cuando el campo no tenia valor antes (status inicial al crear, o
   * result la primera vez que se le asigna uno). */
  @Column({ type: 'varchar', length: 60, nullable: true })
  previousValue: string | null;

  @Column({ type: 'varchar', length: 60, nullable: true })
  newValue: string | null;

  @Index()
  @CreateDateColumn({ type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
  changedAt: Date;

  @Column({ type: 'varchar', length: 40, nullable: true })
  changedByEmployeeNumber: string | null;

  @Column({ type: 'varchar', length: 160, nullable: true })
  changedByName: string | null;
}

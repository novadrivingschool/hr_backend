import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Catalogo de "position" especifico del modulo Candidate Tracker.
 *
 * A proposito NO es el mismo catalogo que `positions` (ver
 * src/position/entities/position.entity.ts) -- esa tabla ya existe y sirve
 * a otra parte del sistema; reusarla fue un error (confirmado por Javier,
 * 2026-09-21). Esta tabla es propia de candidate-tracker.
 *
 * `candidate_trackers.position` se queda como texto libre (ver comentario
 * en CandidateTracker entity, mismo patron que `recruiter`): este catalogo
 * solo alimenta las sugerencias del combobox en el frontend, sin FK, para
 * no romper el historico ya cargado como texto libre.
 */
@Entity('candidate_tracker_positions')
export class CandidateTrackerPosition {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 160, unique: true })
  name: string;
}

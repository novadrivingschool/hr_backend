import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

/**
 * Mapea la tabla `danubenet_history`, creada y administrada por
 * nova-one-backend (Flask/SQLAlchemy) — ver
 * nova-one-backend/src/models/Employees/danubenet_history_model.py.
 * hr_backend solo LEE esta tabla (no crea, no migra) para resolver a qué
 * empleado pertenecía un danubenet_name en una fecha dada.
 */
@Entity('danubenet_history')
export class DanubenetHistory {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 50 })
  employee_number: string;

  @Column({ type: 'varchar', length: 255 })
  danubenet_name: string;

  @Column({ type: 'date' })
  start_date: string;

  @Column({ type: 'date', nullable: true })
  end_date: string | null;

  @Column({ type: 'varchar', length: 500, default: '' })
  notes: string;

  @CreateDateColumn()
  created_at: Date;

  @Column({ type: 'varchar', length: 100, default: '' })
  created_by: string;
}

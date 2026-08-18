/* src\holidays\entities\holiday.entity.ts */
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('holidays')
export class Holiday {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 150 })
  name: string;

  @Column({ type: 'date' })
  date: string;

  @Column({ type: 'varchar', length: 50, default: 'public' })
  type: string;

  // Horas autorizadas a pagar cuando el empleado NO tiene schedule ese día
  // (ver payroll.service.ts -> buildHolidayFallbackScheduleDetails).
  // Nullable a nivel de DB por compatibilidad con registros históricos;
  // el formulario del frontend lo exige como obligatorio para holidays nuevos/editados.
  // Transformer: pg/TypeORM devuelve columnas "numeric" como string por
  // default (para no perder precisión) — la convertimos a number para que
  // el resto del código (payroll.service.ts, frontend) no tenga que hacerlo.
  @Column({
    type: 'numeric',
    precision: 4,
    scale: 2,
    nullable: true,
    transformer: {
      to: (value?: number | null) => value,
      from: (value?: string | null) => (value === null || value === undefined ? null : Number(value)),
    },
  })
  authorized_hours: number | null;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ type: 'boolean', default: true })
  is_active: boolean;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}

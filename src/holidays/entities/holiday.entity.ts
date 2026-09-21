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

  // Indica si el empleado está OBLIGADO A TRABAJAR este holiday. Cuando es
  // true y el empleado NO lo trabajó (sin evento "Holiday Work" ese día), se
  // pagan authorized_hours reemplazando cualquier Work Shift agendado ese
  // día — funciona también como TOPE: el día se paga exactamente
  // authorized_hours, sin importar cuántas horas decía el master schedule.
  // Wired a payroll.service.ts desde 2026-09-02 (ver holidays-mandatory-field
  // en memoria de proyecto). Ver también is_paid_holiday, abajo, para el caso
  // de holidays pagados por ley/política aunque nadie esté obligado a
  // trabajarlos (ej. Labor Day).
  @Column({ type: 'boolean', default: false })
  is_mandatory: boolean;

  // Indica si este holiday se paga (authorized_hours) aunque el empleado NO
  // esté obligado a trabajarlo (is_mandatory=false) y no lo haya trabajado —
  // ej. Labor Day: nadie trabaja, pero por ley/política se pagan igual las
  // horas. Independiente de is_mandatory: cuando is_mandatory=true este flag
  // no aporta nada nuevo (ya se paga por esa vía); solo decide algo cuando
  // is_mandatory=false. Confirmado con Javier 2026-09-03.
  // IMPORTANTE (corregido 2026-09-03, mismo día): este flag NO es solo un
  // "paga sí o no" — cuando es true, esas authorized_hours también se suman
  // al Time Clock Wizard efectivo en payroll.service.ts (effectiveTcwWork,
  // ver getPayrollSummary) para que el TCW no muestre un hueco de asistencia
  // donde en realidad no lo hay. Por eso Javier pidió que NO sea true por
  // default para todos los holidays existentes — debe ser una decisión
  // explícita de HR por holiday (ej. sí en Labor Day, no en otros) y no un
  // blanket flag, para no arrastrar de más al TCW en holidays que no lo
  // necesitan.
  // Default FALSE a nivel de DB: holidays existentes/nuevos NO cambian de
  // comportamiento hasta que HR marque este toggle explícitamente.
  // Ver payroll.service.ts -> getPayrollSummary (holidayHoursByDate,
  // holidayPaidNotWorkedHours).
  @Column({ type: 'boolean', default: false })
  is_paid_holiday: boolean;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ type: 'boolean', default: true })
  is_active: boolean;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}

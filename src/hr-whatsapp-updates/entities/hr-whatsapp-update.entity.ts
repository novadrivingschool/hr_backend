import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  Index,
} from 'typeorm';
import { HrWhatsappUpdateStatusHistory } from './hr-whatsapp-update-status-history.entity';

@Entity('hr_whatsapp_updates')
@Index(['entry_date'])
@Index(['status'])
@Index(['asignacion'])
export class HrWhatsappUpdate {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Fecha del mensaje/reporte (columna " Date" en la hoja de origen).
  @Column({ type: 'date' })
  entry_date: string;

  // ── Columna "Name" ──────────────────────────────────────────────────
  // Debe ser un empleado real (matcheado contra nova-one-backend). Cuando
  // no hay match confiable (ej. "CS chat", un canal, no una persona), se
  // guarda el texto tal cual en reported_other y los 3 campos de empleado
  // quedan en null. Exactamente uno de los dos grupos debe estar poblado
  // (se valida en el service, no acá).
  @Column({ type: 'varchar', length: 50, nullable: true })
  reported_employee_number: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  reported_name: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  reported_last_name: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  reported_other: string | null;

  // Columna "Question/ concern".
  @Column({ type: 'text' })
  question: string;

  // ── Columna "Responsable" ───────────────────────────────────────────
  // Mismo esquema que "Name": empleado real matcheado o texto libre en
  // responsable_other. A diferencia de "Name", el grupo completo es
  // opcional (puede no haber responsable asignado todavía).
  @Column({ type: 'varchar', length: 50, nullable: true })
  responsable_employee_number: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  responsable_name: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  responsable_last_name: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  responsable_other: string | null;

  // Columna "Asignación" — dropdown cerrado, ver HR_WHATSAPP_ASIGNACION_OPTIONS.
  @Column({ type: 'varchar', length: 100 })
  asignacion: string;

  // Columna "Status" — dropdown cerrado, ver HR_WHATSAPP_STATUS_OPTIONS.
  @Column({ type: 'varchar', length: 50, default: 'In Progress' })
  status: string;

  // Columna "Observations".
  @Column({ type: 'text', nullable: true })
  observations: string | null;

  // Columna "Seguimiento".
  @Column({ type: 'text', nullable: true })
  seguimiento: string | null;

  // Columna "Asana Link".
  @Column({ type: 'varchar', length: 500, nullable: true })
  asana_link: string | null;

  // Cómo nació el registro: 'manual' (creado desde el form, un caso a la
  // vez) o 'import' (carga masiva de Excel). Es la diferencia clave para el
  // dashboard de analytics: si un registro "nace" ya en status terminal
  // (OK/Not Resolved) porque source='manual', es un hecho real — HR lo
  // resolvió al instante y esa duración cuenta. Si source='import', ese
  // mismo "ya nació resuelto" es un artefacto del import masivo (decenas de
  // filas comparten la misma marca de tiempo falsa) y NO debe contar como
  // tiempo de resolución real. Ver WhatsappAnalyticsDashboard.vue.
  //
  // El código SIEMPRE lo asigna explícitamente (create() -> 'manual',
  // uploadExcel() -> 'import' para filas nuevas); nunca depende de este
  // default de columna para una inserción real. El default es 'import' (no
  // 'manual') a propósito: es el valor conservador para cualquier fila que
  // termine sin source explícito (ej. backfill de la migración sobre datos
  // que ya existían antes de esta columna) — tratarla como "no confiable
  // para resolución instantánea" es más seguro que asumir que fue manual.
  @Column({ type: 'varchar', length: 20, default: 'import' })
  source: string;

  @CreateDateColumn({ type: 'timestamp with time zone' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamp with time zone' })
  updated_at: Date;

  // Historial de cambios de status — solo se carga explícitamente (analytics),
  // no en los listados normales, para no pagar el join en cada GET.
  @OneToMany(() => HrWhatsappUpdateStatusHistory, (h) => h.update)
  statusHistory: HrWhatsappUpdateStatusHistory[];
}

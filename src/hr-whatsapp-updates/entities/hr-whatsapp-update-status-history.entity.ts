import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { HrWhatsappUpdate } from './hr-whatsapp-update.entity';

// Registro de cada cambio de status de un HrWhatsappUpdate, usado por el
// dashboard de analytics para calcular tiempos de resolución, aging de
// tickets abiertos y tasa de reapertura. Se inserta una fila:
//  - al crear el registro (previous_status: null, new_status: status inicial)
//  - cada vez que update() cambia el status (previous_status/new_status reales)
// Las filas cargadas por Excel también generan su fila inicial, pero con
// changed_at = fecha de importación (no la fecha real del Excel, que no se
// conoce) — ver nota en HrWhatsappUpdatesService.uploadExcel().
@Entity('hr_whatsapp_update_status_history')
@Index(['hr_whatsapp_update_id'])
@Index(['changed_at'])
export class HrWhatsappUpdateStatusHistory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  hr_whatsapp_update_id: string;

  @ManyToOne(() => HrWhatsappUpdate, (update) => update.statusHistory, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'hr_whatsapp_update_id' })
  update: HrWhatsappUpdate;

  @Column({ type: 'varchar', length: 50, nullable: true })
  previous_status: string | null;

  @Column({ type: 'varchar', length: 50 })
  new_status: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  changed_by_name: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  changed_by_employee_number: string | null;

  @CreateDateColumn({ type: 'timestamp with time zone' })
  changed_at: Date;
}

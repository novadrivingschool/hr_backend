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

// Un adjunto de comentario — a diferencia de HrWhatsappUpdate.attachments
// (array de strings sueltos), acá guardamos el objeto completo que ya
// devuelve el upload (name/mime_type/size) para poder mostrar el comentario
// sin tener que ir a buscar metadata aparte. Mismo criterio que usa Novana
// para adjuntos de comentario (novana_comments.attachments).
export interface HrWhatsappCommentAttachment {
  key: string;
  name: string;
  mime_type: string;
  size: number;
}

// Historial de comentarios de un HrWhatsappUpdate — texto libre + adjuntos
// opcionales, uno a muchos con el registro. Se usa tanto para el comentario
// inicial (al crear el registro) como para comentarios de seguimiento
// posteriores. No tiene updated_at: un comentario no se edita, solo se crea.
@Entity('hr_whatsapp_update_comments')
@Index(['hr_whatsapp_update_id'])
@Index(['created_at'])
export class HrWhatsappUpdateComment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  hr_whatsapp_update_id: string;

  @ManyToOne(() => HrWhatsappUpdate, (update) => update.comments, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'hr_whatsapp_update_id' })
  update: HrWhatsappUpdate;

  // Puede ir vacío si el comentario es solo un archivo (se valida en el
  // service que al menos uno de los dos —body o attachments— esté presente).
  @Column({ type: 'text', nullable: true })
  body: string | null;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  attachments: HrWhatsappCommentAttachment[];

  @Column({ type: 'varchar', length: 255, nullable: true })
  created_by_name: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  created_by_employee_number: string | null;

  @CreateDateColumn({ type: 'timestamp with time zone' })
  created_at: Date;
}

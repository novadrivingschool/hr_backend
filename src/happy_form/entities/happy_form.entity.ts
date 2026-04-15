import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('happy_forms')
export class HappyForm {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'date' })
  date: Date;

  @Column({ type: 'text' })
  happeningsDetails: string;

  // Usamos simple-array para guardar las URLs o rutas de los archivos subidos
  @Column({ type: 'simple-array', nullable: true })
  attachments: string[];

  @Column({ length: 255 })
  accountName: string;

  @Column({ length: 255 })
  danubenetZohoLink: string;

  @Column({ length: 50 })
  phoneNumber: string;

  @Column({ length: 50 })
  priorityLevel: string;

  @Column({ length: 255 })
  submitterName: string;

  @Column({ length: 255, nullable: true })
  submitterNameCustom: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
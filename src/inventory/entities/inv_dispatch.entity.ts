import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('inv_dispatches')
export class InvDispatch {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  from_warehouse_id: string;

  @Column({ type: 'varchar', length: 120 })
  from_warehouse_name: string;

  @Column({ type: 'varchar', length: 160 })
  recipient_name: string;

  @Column({ type: 'varchar', length: 80, nullable: true })
  recipient_id: string;

  @Column({ type: 'varchar', length: 20, default: 'Staff' }) // Staff | Vehicle | Other
  recipient_type: string;

  @Column({ type: 'jsonb', default: [] })
  items: Record<string, any>[]; // [{ item_id, item_name, serial_number, quantity, unit }]

  @Column({ type: 'text', nullable: true })
  notes: string;

  @Column({ type: 'jsonb', default: {} })
  dispatched_by: Record<string, any>;

  @Column({ type: 'timestamptz', nullable: true })
  dispatched_at: Date;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}

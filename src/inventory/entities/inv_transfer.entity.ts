import { Entity, PrimaryGeneratedColumn, Column, Index, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('inv_transfers')
export class InvTransfer {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 20, default: 'outbound' }) // outbound | internal | return
  transfer_type: string;

  @Column({ type: 'uuid' })
  from_warehouse_id: string;

  @Column({ type: 'varchar', length: 120 })
  from_warehouse_name: string;

  @Column({ type: 'uuid' })
  to_warehouse_id: string;

  @Column({ type: 'varchar', length: 120 })
  to_warehouse_name: string;

  @Column({ type: 'jsonb', default: [] })
  items: Record<string, any>[]; // [{ item_id, item_name, sku, serial_number, quantity, unit }]

  @Index()
  @Column({ type: 'varchar', length: 20, default: 'PENDING' }) // PENDING | IN_TRANSIT | CONFIRMED | REJECTED | CANCELLED
  status: string;

  @Column({ type: 'text', nullable: true })
  notes: string;

  @Column({ type: 'text', nullable: true })
  return_reason: string;

  // Timeline fields as jsonb
  @Column({ type: 'jsonb', default: {} })
  requested_by: Record<string, any>;

  @Column({ type: 'timestamptz', nullable: true })
  requested_at: Date;

  @Column({ type: 'jsonb', default: {} })
  sent_by: Record<string, any>;

  @Column({ type: 'timestamptz', nullable: true })
  sent_at: Date;

  @Column({ type: 'text', nullable: true })
  sent_notes: string;

  @Column({ type: 'jsonb', default: {} })
  confirmed_by: Record<string, any>;

  @Column({ type: 'timestamptz', nullable: true })
  confirmed_at: Date;

  @Column({ type: 'text', nullable: true })
  confirm_notes: string;

  @Column({ type: 'jsonb', default: {} })
  rejected_by: Record<string, any>;

  @Column({ type: 'timestamptz', nullable: true })
  rejected_at: Date;

  @Column({ type: 'text', nullable: true })
  rejection_reason: string;

  @Column({ type: 'jsonb', default: {} })
  cancelled_by: Record<string, any>;

  @Column({ type: 'timestamptz', nullable: true })
  cancelled_at: Date;

  @Column({ type: 'text', nullable: true })
  cancel_reason: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}

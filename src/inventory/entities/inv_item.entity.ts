import { Entity, PrimaryGeneratedColumn, Column, Index, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('inv_items')
export class InvItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'varchar', length: 160 })
  product_name: string;

  @Column({ type: 'varchar', length: 80, nullable: true })
  sku: string;

  @Column({ type: 'varchar', length: 120, nullable: true })
  serial_number: string;

  @Column({ type: 'varchar', length: 80, nullable: true })
  brand: string;

  @Column({ type: 'varchar', length: 80, nullable: true })
  model: string;

  @Column({ type: 'varchar', length: 20, default: 'Good' }) // New | Good | Fair | Poor | Damaged
  condition: string;

  @Column({ type: 'uuid' })
  warehouse_id: string;

  @Column({ type: 'varchar', length: 20, default: 'pcs' }) // pcs | box | pack | bottle | roll | set | pair
  unit: string;

  @Column({ type: 'int', default: 0 })
  quantity: number;

  @Column({ type: 'int', default: 0 })
  min_stock: number;

  @Column({ type: 'text', nullable: true })
  notes: string;

  @Column({ type: 'boolean', default: true })
  is_active: boolean;

  @Column({ type: 'boolean', default: false })
  baja: boolean;

  @Column({ type: 'jsonb', default: {} })
  baja_info: Record<string, any>; // { disposition, reason, authorized_by }

  @Column({ type: 'jsonb', default: {} })
  createdBy: Record<string, any>; // { fullName, employee_number }

  @Column({ type: 'jsonb', default: {} })
  updatedBy: Record<string, any>;

  @Column({ type: 'jsonb', default: [] })
  history: Record<string, any>[]; // audit trail entries

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}

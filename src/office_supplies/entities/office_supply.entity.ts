import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn, Index
} from 'typeorm'

export enum SupplyStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  NOT_APPROVED = 'not_approved',
}

@Entity('office_supplies')
export class OfficeSupply {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Index()
  @Column({ type: 'date' })
  requestDate: string

  @Index()
  @Column({ type: 'varchar', length: 160 })
  requester: string

  // opcional: si decides enviar el número del empleado desde el front
  @Index()
  @Column({ type: 'varchar', length: 40, nullable: true })
  requesterEmployeeNumber: string | null

  @Index()
  @Column({ type: 'varchar', length: 120 })
  location: string

  @Column({ type: process.env.DB_TYPE === 'postgres' ? 'jsonb' : 'simple-json', default: {} })
  office: Record<string, number>

  @Column({ type: process.env.DB_TYPE === 'postgres' ? 'jsonb' : 'simple-json', default: {} })
  cleaning: Record<string, number>

  @Column({ type: process.env.DB_TYPE === 'postgres' ? 'jsonb' : 'simple-json', default: {} })
  desk: Record<string, number>

  @Column({ type: process.env.DB_TYPE === 'postgres' ? 'jsonb' : 'simple-json', default: {} })
  kitchen: Record<string, number>

  @Column({ type: 'text', nullable: true })
  otherKitchenItems: string | null

  @Column({ type: 'text', nullable: true })
  observations: string | null

  @Index()
  @Column({ type: 'int', default: 0 })
  itemsCount: number

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date

  // ✅ NUEVO: estado del pedido
  @Index()
  @Column({
    type: 'varchar',
    length: 20,
    default: SupplyStatus.PENDING,
  })
  status: SupplyStatus

  // ✅ Links de referencia
  @Column({ type: 'jsonb', default: [] })
  links: string[]

  // ✅ Archivos adjuntos (imágenes o PDFs)
  @Column({ type: 'jsonb', default: [] })
  attachments: string[]

  @Column({ type: 'text', nullable: true })
  notes: string | null

  @Column({ type: 'text', nullable: true })
  employee_number: string | null

}

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm'

export enum DepositStatus {
  PENDING  = 'pending',
  RECEIVED = 'received',
  VERIFIED = 'verified',
}

@Entity('bank_deposits')
export class BankDeposit {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column({ type: 'varchar', length: 160 })
  location: string

  @Column({ type: 'date' })
  date: string

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  amount: number

  @Column({ type: 'varchar', length: 100, nullable: true })
  receipt_number: string

  @Column({ type: 'text', nullable: true })
  notes: string

  @Column({ type: 'simple-array', nullable: true })
  files: string[]

  @Column({ type: 'varchar', length: 160 })
  fullName: string

  @Column({ type: 'varchar', length: 50 })
  employee_number: string

  // ── Accounting status ───────────────────────────────────────────
  @Column({
    type: 'enum',
    enum: DepositStatus,
    default: DepositStatus.PENDING,
  })
  status: DepositStatus

  @Column({ type: 'text', nullable: true })
  accounting_comments: string

  @Column({ type: 'varchar', length: 50, nullable: true })
  accounting_employee_number: string

  @Column({ type: 'varchar', length: 160, nullable: true })
  accounting_fullName: string

  @Column({ type: 'simple-array', nullable: true })
  accounting_files: string[]

  // ── Timestamps / soft delete ────────────────────────────────────
  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt: Date

  @UpdateDateColumn({ type: 'timestamp with time zone' })
  updatedAt: Date

  @Column({ type: 'boolean', default: false })
  deleted: boolean
}

// src/facilities/entities/facility.entity.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  BeforeInsert,
  BeforeUpdate,
} from 'typeorm'

export enum FacilityStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
}

@Entity('facilities')
export class Facility {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column({ type: 'varchar', length: 160 })
  ubicacion: string

  @Column({ type: 'text' })
  request: string

  @Column({ type: 'varchar', length: 160 })
  fullName: string

  @Column({ type: 'varchar', length: 50 })
  employee_number: string

  @Column({
    type: 'enum',
    enum: FacilityStatus,
    default: FacilityStatus.PENDING,
  })
  status: FacilityStatus

  @Column({ type: 'text', nullable: true })
  admin_comments: string

  @Column({ type: 'varchar', length: 50, nullable: true })
  admin_employee_number: string

  @Column({ type: 'varchar', length: 160, nullable: true })
  admin_fullName: string

  @Column({ type: 'simple-array', nullable: true })
  attachments: string[]

  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt: Date

  @UpdateDateColumn({ type: 'timestamp with time zone' })
  updatedAt: Date

  @Column({ type: 'boolean', default: false })
  deleted: boolean

  @BeforeInsert()
  @BeforeUpdate()
  validateAttachments() {
    if (this.attachments && !Array.isArray(this.attachments)) {
      throw new Error('Attachments must be an array')
    }
  }
}
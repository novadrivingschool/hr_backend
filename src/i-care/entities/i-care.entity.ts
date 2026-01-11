import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('i_care')
export class ICare {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  urgency: string;

  @Column()
  date: string;

  @Column('jsonb')
  submitter: {
    name: string;
    last_name: string;
    employee_number: string;
    nova_email: string;
  };

  @Column('jsonb', { nullable: true })
  staff_name: {
    name: string;
    last_name: string;
    employee_number: string;
    nova_email: string;
  } | null; // NUEVO: Staff's Name

  @Column('jsonb', { nullable: true })
  responsible: Array<{
    name: string;
    last_name: string;
    employee_number: string;
    nova_email: string;
  }> | null;

  @Column({ nullable: true })
  department: string;

  @Column()
  staffType: string;

  @Column()
  reason: string;

  @Column('text')
  details: string;

  @Column({ nullable: true })
  dnAccountLink: string;

  @Column({ nullable: true })
  accountPhone: string;

  @Column('jsonb', { nullable: true })
  attachments: any[];

  @CreateDateColumn({ type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
  updatedAt: Date;
}
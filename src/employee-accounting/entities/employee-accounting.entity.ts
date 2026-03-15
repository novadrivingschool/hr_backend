import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToOne,
  JoinColumn,
} from 'typeorm';
import { Employee } from '../../employees/entities/employee.entity';

@Entity('employee_accounting')
export class EmployeeAccounting {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  employee_number: string;

  @OneToOne(() => Employee, (employee) => employee.employeeAccounting, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({
    name: 'employee_number',
    referencedColumnName: 'employee_number',
  })
  employee: Employee;

  @Column({ nullable: true })
  type_of_income: string;

  @Column({ type: 'float', default: 0 })
  rate_office_staff: number;

  @Column({ type: 'float', default: 0 })
  btw_rate: number;

  @Column({ type: 'float', default: 0 })
  class_c_rate: number;

  @Column({ type: 'float', default: 0 })
  cr_rate: number;

  @Column({ type: 'float', default: 0 })
  ss_rate: number;

  @Column({ type: 'float', default: 0 })
  training_rate: number;

  @Column({ type: 'float', default: 0 })
  assignment_rate: number;

  @Column({ type: 'float', default: 0 })
  commissions: number;

  @Column({ nullable: true, default: 'N/A' })
  payment_method: string;

  @Column({ nullable: true, default: 'N/A' })
  receives_comissions: string;

  @Column({ nullable: true, default: 'N/A' })
  pay_frequency: string;

  @Column({ type: 'float', default: 0 })
  office_maintenance: number;

  @Column({ type: 'float', default: 0, nullable: true })
  authorized_hours: number;

  @CreateDateColumn({ type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
  updatedAt: Date;
}
// Archivo: crm-permissions.entity.ts
import { Entity, PrimaryColumn, Column, OneToOne, JoinColumn } from 'typeorm';
import { Employee } from './employee.entity'; // <-- Importando usando el estándar

@Entity('crm_permissions')
export class CrmPermissions {
    @PrimaryColumn({ type: 'varchar', length: 255 })
    employee_number: string;

    @OneToOne(() => Employee, (employee) => employee.permissions_relation)
    @JoinColumn({ name: 'employee_number', referencedColumnName: 'employee_number' })
    employee: Employee;

    @Column({ type: 'boolean', default: false, nullable: true })
    nova_crm: boolean;

    @Column({ type: 'boolean', default: false, nullable: true })
    admin_console: boolean;

    @Column({ type: 'boolean', default: false, nullable: true })
    operator_console: boolean;

    @Column({ type: 'boolean', default: false, nullable: true })
    marketing: boolean;

    @Column({ type: 'boolean', default: false, nullable: true })
    others: boolean;

    @Column({ type: 'boolean', default: false, nullable: true })
    reports: boolean;

    @Column({ type: 'boolean', default: false, nullable: true })
    crm_texas: boolean;

    @Column({ type: 'boolean', default: false, nullable: true })
    crm_chicago: boolean;
}
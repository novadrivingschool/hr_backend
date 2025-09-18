import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('employees') // usa el nombre exacto de la tabla ya existente
export class Employee {
    @PrimaryGeneratedColumn()
    id: number;

    @Column()
    name: string;

    @Column()
    last_name: string;

    @Column({ unique: true })
    employee_number: string;

    @Column()
    status: string;

    /* @Column()
    department: string; */

    /* @Column()
    country: string; */

    @Column()
    location: string;

    /* @Column()
    company: string; */

    // NUEVOS CAMPOS
    @Column({ length: 255, default: '' })
    nova_email: string;

    @Column({ length: 100, default: '' })
    position: string;

    // employee.entity.ts
    @Column({ type: 'json', nullable: false })
    multi_department: string[];

    @Column({ type: 'json', nullable: false })
    multi_location: string[];

    @Column({ type: 'json', nullable: false })
    multi_company: string[];

    @Column()
    has_assigned_equipment: boolean;


}

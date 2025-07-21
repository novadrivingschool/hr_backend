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

    @Column()
    department: string;

    @Column()
    country: string;

    @Column()
    location: string;

    @Column()
    company: string;

}

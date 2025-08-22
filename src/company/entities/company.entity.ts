import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('companies')
export class Company {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ unique: true })
    name: string;
}

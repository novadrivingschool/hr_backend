import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('type_of_schedules')
export class TypeOfSchedule {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ unique: true })
    name: string;
}

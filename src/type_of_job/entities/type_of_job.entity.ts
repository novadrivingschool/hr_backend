import { Column, Entity, PrimaryGeneratedColumn } from "typeorm";

@Entity('type_of_job')
export class TypeOfJob {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ unique: true })
    name: string;
}

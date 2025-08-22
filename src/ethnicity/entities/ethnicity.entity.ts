import { Column, Entity, PrimaryGeneratedColumn } from "typeorm";

@Entity('ethnicities')
export class Ethnicity {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ unique: true })
    name: string;
}

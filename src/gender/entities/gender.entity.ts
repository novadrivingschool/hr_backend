import { Column, Entity, PrimaryGeneratedColumn } from "typeorm";

@Entity('genders')
export class Gender {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ unique: true })
    name: string;
}

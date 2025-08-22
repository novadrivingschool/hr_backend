import { Column, Entity, PrimaryGeneratedColumn } from "typeorm";

@Entity('positions')
export class Position {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ unique: true })
    name: string;
}

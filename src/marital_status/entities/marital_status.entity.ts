import { Column, Entity, PrimaryGeneratedColumn } from "typeorm";

@Entity('marital_statuses')
export class MaritalStatus {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ unique: true })
    name: string;
}
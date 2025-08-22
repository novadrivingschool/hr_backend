import { Column, Entity, PrimaryGeneratedColumn } from "typeorm";

@Entity('type_of_staffs')
export class TypeOfStaff {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ unique: true })
    name: string;
}

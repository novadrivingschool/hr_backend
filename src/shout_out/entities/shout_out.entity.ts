import { Column, Entity, PrimaryGeneratedColumn } from "typeorm";
import { EmployeeDto, RecipientDto } from "../dto/create-shout_out.dto";

@Entity('shout_out')
export class ShoutOut {

    @PrimaryGeneratedColumn('uuid')
    uuid: string;

    @Column({ type: "timestamptz", nullable: false })
    created_date: Date;

    @Column({ type: "jsonb", nullable: false })
    sender: EmployeeDto;

    @Column({ type: 'jsonb', nullable: false })
    person_to: RecipientDto;

    @Column({ type: 'jsonb', nullable: false })
    reasons: string[];

    @Column({ nullable: true })
    comments: string;
}

import { Column, Entity, PrimaryGeneratedColumn } from "typeorm";

@Entity('worker_categories')
export class WorkerCategory {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ unique: true })
    name: string;
}

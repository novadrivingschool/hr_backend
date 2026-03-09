import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('i_care_reason')
export class ICareReason {
    @PrimaryGeneratedColumn()
    id: number;

    @Column()
    category: string;

    @Column()
    reason: string;

    @Column({ type: 'text', nullable: true })
    description: string;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}

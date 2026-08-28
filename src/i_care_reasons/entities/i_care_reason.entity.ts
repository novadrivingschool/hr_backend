import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { ICareUrgency } from '../../i-care/entities/i-care.entity';

@Entity('i_care_reason')
export class ICareReason {
    @PrimaryGeneratedColumn()
    id: number;

    @Column()
    category: string;

    @Column()
    reason: string;

    // varchar (no enum nativo de Postgres) -- mismo criterio ya usado en
    // i_care.escalated_urgency / i_care.downgraded_from_urgency: se valida
    // ICareUrgency a nivel de aplicacion (DTO), sin acoplar esta tabla al
    // tipo enum nativo de "i_care.urgency". Nullable: filas existentes antes
    // de esta migracion no tienen urgency hasta que se editen o se reimporten.
    @Column({ type: 'varchar', length: 20, nullable: true })
    urgency: ICareUrgency | null;

    @Column({ type: 'text', nullable: true })
    description: string;

    @Column({ type: 'text', array: true, default: '{All}' })
    applies_to: string[];

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}

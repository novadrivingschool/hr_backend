import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { ICareUrgency } from '../../i-care/entities/i-care.entity';
import { ICareOffenseCategory } from '../enums/offense-category.enum';

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

    // Class B/C/D (sin Class A), confirmado por el usuario 2026-09-19 --
    // ver src/i_care_reasons/enums/offense-category.enum.ts. Nullable/
    // opcional por decision propia (no confirmada por el usuario): no
    // bloquea altas/ediciones de reasons existentes, a diferencia de urgency.
    // length 100 (no 20 como urgency): los valores reales son texto
    // descriptivo ("Class C Moderate Offense" = 24 chars), no codigos cortos.
    // Bug real 2026-09-19: se copio length:20 de urgency sin chequear el
    // largo real de estos valores -> "value too long for character varying(20)"
    // al importar el Excel real. Ver migracion de ajuste de largo.
    @Column({ type: 'varchar', length: 100, nullable: true })
    offense_category: ICareOffenseCategory | null;

    @Column({ type: 'text', nullable: true })
    description: string;

    @Column({ type: 'text', array: true, default: '{All}' })
    applies_to: string[];

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}

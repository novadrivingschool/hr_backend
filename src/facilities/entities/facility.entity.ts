import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm'

export type Seccion = {
  title: string
  checked: string[]   // textos de ítems marcados
  notes: string | null
}

@Entity('facilities')
export class Facility {
  @PrimaryGeneratedColumn('uuid')
  id: string

  // fecha del checklist (yyyy-mm-dd)
  @Column({ type: 'date' })
  @Index()
  fecha: string

  // responsable (nombre completo desde auth)
  @Column({ type: 'varchar', length: 160 })
  @Index()
  responsable: string

  // ubicación (string plano; combobox del front)
  @Column({ type: 'varchar', length: 160 })
  @Index()
  ubicacion: string

  // objeto de secciones (key -> {title, checked[], notes})
  @Column({ type: 'jsonb', default: {} })
  secciones: Record<string, Seccion>

  // meta: { totalTareas, tareasMarcadas }
  @Column({ type: 'jsonb', default: {} })
  _meta: { totalTareas: number; tareasMarcadas: number }

  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt: Date

  @UpdateDateColumn({ type: 'timestamp with time zone' })
  updatedAt: Date

  // Borrado lógico opcional (no expuesto por ahora)
  @Column({ type: 'boolean', default: false })
  deleted: boolean
}

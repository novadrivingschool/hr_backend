import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('instructor_restrictions')
export class InstructorRestriction {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 255 })
  name: string;
}
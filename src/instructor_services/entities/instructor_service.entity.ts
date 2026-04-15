import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('instructor_services')
export class InstructorService {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 255 })
  name: string;
}
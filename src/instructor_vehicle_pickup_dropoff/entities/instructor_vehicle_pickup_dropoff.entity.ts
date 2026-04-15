import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('instructor_vehicle_pickup_dropoff')
export class InstructorVehiclePickupDropoff {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 255 })
  name: string;
}
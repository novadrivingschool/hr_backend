import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InstructorVehiclePickupDropoffService } from './instructor_vehicle_pickup_dropoff.service';
import { InstructorVehiclePickupDropoffController } from './instructor_vehicle_pickup_dropoff.controller';
import { InstructorVehiclePickupDropoff } from './entities/instructor_vehicle_pickup_dropoff.entity';

@Module({
  imports: [TypeOrmModule.forFeature([InstructorVehiclePickupDropoff])],
  controllers: [InstructorVehiclePickupDropoffController],
  providers: [InstructorVehiclePickupDropoffService],
})
export class InstructorVehiclePickupDropoffModule {}
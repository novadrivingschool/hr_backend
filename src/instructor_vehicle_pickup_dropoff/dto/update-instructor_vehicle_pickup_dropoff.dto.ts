import { PartialType } from '@nestjs/mapped-types';
import { CreateInstructorVehiclePickupDropoffDto } from './create-instructor_vehicle_pickup_dropoff.dto';

export class UpdateInstructorVehiclePickupDropoffDto extends PartialType(CreateInstructorVehiclePickupDropoffDto) {}

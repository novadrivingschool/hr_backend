import { IsNotEmpty, IsString } from 'class-validator';

export class CreateInstructorVehiclePickupDropoffDto {
  @IsString()
  @IsNotEmpty()
  name: string;
}
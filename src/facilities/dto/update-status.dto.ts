// src/facilities/dto/update-status.dto.ts
import { IsString, IsNotEmpty, IsOptional, IsEnum } from 'class-validator'
import { FacilityStatus } from '../entities/facility.entity'

export class UpdateStatusDto {
  @IsNotEmpty()
  @IsEnum(FacilityStatus)
  status: FacilityStatus

  @IsOptional()
  @IsString()
  admin_comments?: string

  @IsString() @IsNotEmpty()
  admin_employee_number: string

  @IsString() @IsNotEmpty()
  admin_fullName: string
}
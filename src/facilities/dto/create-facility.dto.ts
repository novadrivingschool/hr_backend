// src/facilities/dto/create-facility.dto.ts
import { IsString, IsNotEmpty, IsOptional, IsEnum, IsArray } from 'class-validator'
import { FacilityStatus } from '../entities/facility.entity'

export class CreateFacilityDto {
  @IsString() @IsNotEmpty()
  ubicacion: string

  @IsString() @IsNotEmpty()
  request: string

  @IsString() @IsNotEmpty()
  fullName: string

  @IsString() @IsNotEmpty()
  employee_number: string

  @IsOptional()
  @IsEnum(FacilityStatus)
  status?: FacilityStatus

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  attachments?: string[]
}
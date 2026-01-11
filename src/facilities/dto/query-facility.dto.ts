import { IsOptional, IsString, IsEnum, IsNumber } from 'class-validator'
import { Type } from 'class-transformer'
import { FacilityStatus } from '../entities/facility.entity'

export class QueryFacilityDto {
  @IsOptional() @IsString()
  search?: string

  @IsOptional() @IsString()
  ubicacion?: string

  @IsOptional() @IsString()
  employee_number?: string

  @IsOptional()
  @IsEnum(FacilityStatus)
  status?: FacilityStatus

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  page?: number = 1

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  limit?: number = 20
}
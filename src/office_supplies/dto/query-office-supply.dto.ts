import { IsOptional, IsString, IsDateString, IsInt, Min, IsEnum } from 'class-validator'
import { Type } from 'class-transformer'
import { SupplyStatus } from '../entities/office_supply.entity'

export class QueryOfficeSupplyDto {
  @IsOptional() @IsString()
  search?: string

  @IsOptional() @IsString()
  location?: string

  // 🔹 Nuevo: filtrar por status
  @IsOptional()
  @IsEnum(SupplyStatus)
  status?: SupplyStatus

  // 🔹 Usaremos estas fechas contra os.createdAt (no requestDate)
  @IsOptional() @IsDateString()
  date_from?: string

  @IsOptional() @IsDateString()
  date_to?: string

  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page?: number = 1

  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  limit?: number = 20
}

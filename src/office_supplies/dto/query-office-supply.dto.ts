import { IsOptional, IsString, IsDateString, IsInt, Min } from 'class-validator'
import { Type } from 'class-transformer'

export class QueryOfficeSupplyDto {
  @IsOptional() @IsString()
  search?: string

  @IsOptional() @IsString()
  location?: string

  @IsOptional() @IsDateString()
  date_from?: string

  @IsOptional() @IsDateString()
  date_to?: string

  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page?: number = 1

  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  limit?: number = 20
}

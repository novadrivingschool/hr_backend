import { IsNumber, IsOptional, Min, IsInt, IsObject, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class SearchEmployeeDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 10;

  @IsOptional()
  @IsObject()
  // Record<string, any> indica que es un objeto clave:valor dinámico
  filters?: Record<string, any>; 
}
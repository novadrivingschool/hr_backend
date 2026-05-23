import { IsOptional, IsString, IsInt, Min, IsIn } from 'class-validator';
import { Type } from 'class-transformer';

export class QueryItemDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  warehouse_id?: string;

  @IsOptional()
  @IsIn(['active', 'decommissioned', 'all'])
  status?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 100;
}

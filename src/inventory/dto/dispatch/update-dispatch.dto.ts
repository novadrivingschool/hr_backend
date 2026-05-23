import { IsOptional, IsString, IsArray, IsIn, IsObject } from 'class-validator';

export class UpdateDispatchDto {
  @IsOptional()
  @IsString()
  from_warehouse_id?: string;

  @IsOptional()
  @IsString()
  from_warehouse_name?: string;

  @IsOptional()
  @IsString()
  recipient_name?: string;

  @IsOptional()
  @IsString()
  recipient_id?: string;

  @IsOptional()
  @IsIn(['Staff', 'Vehicle', 'Other'])
  recipient_type?: string;

  @IsOptional()
  @IsArray()
  items?: Record<string, any>[];

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsObject()
  updated_by?: Record<string, any>;
}

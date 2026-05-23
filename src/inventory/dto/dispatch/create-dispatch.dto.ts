import { IsString, IsNotEmpty, IsOptional, IsArray, IsObject, IsIn, Length } from 'class-validator';

export class CreateDispatchDto {
  // from_warehouse_id can be null when warehouse lookup fails
  @IsOptional()
  @IsString()
  from_warehouse_id?: string | null;

  @IsOptional()
  @IsString()
  from_warehouse_name?: string;

  @IsString()
  @IsNotEmpty()
  @Length(1, 160)
  recipient_name: string;

  @IsOptional()
  @IsString()
  @Length(0, 80)
  recipient_id?: string;

  @IsOptional()
  @IsIn(['Staff', 'Vehicle', 'Other'])
  recipient_type?: string;

  @IsArray()
  items: Record<string, any>[];

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsObject()
  dispatched_by?: Record<string, any>;

  // Frontend sends dispatched_at timestamp on create
  @IsOptional()
  @IsString()
  dispatched_at?: string;
}

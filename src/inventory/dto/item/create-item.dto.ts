import { IsString, IsNotEmpty, IsOptional, IsBoolean, IsInt, IsObject, IsArray, Length, IsIn, Min } from 'class-validator';

export class CreateItemDto {
  @IsString()
  @IsNotEmpty()
  @Length(1, 160)
  product_name: string;

  @IsOptional()
  @IsString()
  @Length(0, 80)
  sku?: string;

  @IsOptional()
  @IsString()
  @Length(0, 120)
  serial_number?: string;

  @IsOptional()
  @IsString()
  @Length(0, 80)
  brand?: string;

  @IsOptional()
  @IsString()
  @Length(0, 80)
  model?: string;

  @IsOptional()
  @IsIn(['New', 'Good', 'Fair', 'Poor', 'Damaged'])
  condition?: string;

  // Frontend sends warehouse_id as part of the resolved payload
  @IsOptional()
  @IsString()
  warehouse_id?: string;

  // Frontend also sends location (the warehouse display name) alongside warehouse_id
  @IsOptional()
  @IsString()
  location?: string;

  // Frontend uses a combobox that allows free-text units beyond the preset list
  @IsOptional()
  @IsString()
  unit?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  quantity?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  min_stock?: number;

  @IsOptional()
  @IsString()
  notes?: string;

  // Frontend sends is_active and baja on create
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;

  @IsOptional()
  @IsBoolean()
  baja?: boolean;

  // Audit fields — no strict type validation, values can be string | null | object | null
  @IsOptional()
  createdAt?: any;

  @IsOptional()
  createdHr?: any;

  @IsOptional()
  updatedAt?: any;

  @IsOptional()
  createdBy?: any;

  @IsOptional()
  updatedBy?: any;

  @IsOptional()
  history?: any[];
}

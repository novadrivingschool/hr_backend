import { PartialType } from '@nestjs/mapped-types';
import { CreateItemDto } from './create-item.dto';
import { IsOptional, IsBoolean, IsObject, IsString } from 'class-validator';

export class UpdateItemDto extends PartialType(CreateItemDto) {
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;

  @IsOptional()
  @IsBoolean()
  baja?: boolean;

  @IsOptional()
  @IsObject()
  baja_info?: Record<string, any>;

  // Frontend sends id in the patch body
  @IsOptional()
  @IsString()
  id?: string;

  // Frontend sends updatedAt timestamp in patch
  @IsOptional()
  @IsString()
  updatedAt?: string;

  @IsOptional()
  @IsObject()
  updatedBy?: Record<string, any>;
}

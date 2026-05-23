import { IsOptional, IsString, IsObject, IsIn, IsArray } from 'class-validator';

export class UpdateTransferDto {
  @IsOptional()
  @IsIn(['PENDING', 'IN_TRANSIT', 'CONFIRMED', 'REJECTED', 'CANCELLED'])
  status?: string;

  // ── Editable fields ──
  @IsOptional()
  @IsString()
  from_warehouse_id?: string;

  @IsOptional()
  @IsString()
  from_warehouse_name?: string;

  @IsOptional()
  @IsString()
  to_warehouse_id?: string;

  @IsOptional()
  @IsString()
  to_warehouse_name?: string;

  @IsOptional()
  @IsArray()
  items?: Record<string, any>[];

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsObject()
  sent_by?: Record<string, any>;

  // Frontend sends sent_at timestamp in the patch
  @IsOptional()
  @IsString()
  sent_at?: string;

  @IsOptional()
  @IsString()
  sent_notes?: string;

  @IsOptional()
  @IsObject()
  confirmed_by?: Record<string, any>;

  // Frontend sends confirmed_at timestamp in the patch
  @IsOptional()
  @IsString()
  confirmed_at?: string;

  @IsOptional()
  @IsString()
  confirm_notes?: string;

  @IsOptional()
  @IsObject()
  rejected_by?: Record<string, any>;

  // Frontend sends rejected_at timestamp in the patch
  @IsOptional()
  @IsString()
  rejected_at?: string;

  @IsOptional()
  @IsString()
  rejection_reason?: string;

  @IsOptional()
  @IsObject()
  cancelled_by?: Record<string, any>;

  // Frontend sends cancelled_at timestamp in the patch
  @IsOptional()
  @IsString()
  cancelled_at?: string;

  @IsOptional()
  @IsString()
  cancel_reason?: string;
}

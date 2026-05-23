import { IsString, IsNotEmpty, IsOptional, IsArray, IsObject, IsIn } from 'class-validator';

export class CreateTransferDto {
  @IsOptional()
  @IsIn(['outbound', 'internal', 'return'])
  transfer_type?: string;

  // from_warehouse_id can be null when the warehouse lookup fails
  @IsOptional()
  @IsString()
  from_warehouse_id?: string | null;

  @IsOptional()
  @IsString()
  from_warehouse_name?: string;

  // to_warehouse_id can be null when the warehouse lookup fails
  @IsOptional()
  @IsString()
  to_warehouse_id?: string | null;

  @IsOptional()
  @IsString()
  to_warehouse_name?: string;

  @IsArray()
  items: Record<string, any>[];

  // Frontend sends status='PENDING' on create
  @IsOptional()
  @IsIn(['PENDING', 'IN_TRANSIT', 'CONFIRMED', 'REJECTED', 'CANCELLED'])
  status?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  return_reason?: string;

  @IsOptional()
  @IsObject()
  requested_by?: Record<string, any>;

  // Frontend sends requested_at timestamp on create
  @IsOptional()
  @IsString()
  requested_at?: string;

  // Frontend sends all workflow fields null on create
  @IsOptional()
  sent_by?: Record<string, any> | null;

  @IsOptional()
  sent_at?: string | null;

  @IsOptional()
  sent_notes?: string | null;

  @IsOptional()
  confirmed_by?: Record<string, any> | null;

  @IsOptional()
  confirmed_at?: string | null;

  @IsOptional()
  confirm_notes?: string | null;

  @IsOptional()
  rejected_by?: Record<string, any> | null;

  @IsOptional()
  rejected_at?: string | null;

  @IsOptional()
  rejection_reason?: string | null;

  @IsOptional()
  cancelled_by?: Record<string, any> | null;

  @IsOptional()
  cancelled_at?: string | null;

  @IsOptional()
  cancel_reason?: string | null;
}

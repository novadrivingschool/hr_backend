// dto/hr-reject-i-care.dto.ts
import { Type } from 'class-transformer';
import {
  IsArray, IsObject, IsOptional, IsString,
  ValidateNested,
} from 'class-validator';

class EmployeeRefDto {
  @IsString() name: string;
  @IsString() last_name: string;
  @IsString() employee_number: string;
  @IsString() nova_email: string;
}

/**
 * DTO para que HR/Management rechace definitivamente un iCare en estado pending.
 * El record pasa directamente a REJECTED (sin pasar por rejection_under_review).
 * Se notifica a Coordinator y Staff.
 */
export class HrRejectICareDto {
  @IsObject()
  @ValidateNested()
  @Type(() => EmployeeRefDto)
  rejected_by: EmployeeRefDto;

  // 2026-08-20: @MaxLength(2000) removed at the user's explicit request
  // ("no puedes dejar solo 2 mil, déjalo libre") — was rejecting real
  // write-ups with a 400. Old declaration kept for reference: @MaxLength(2000)
  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  attachments?: string[];
}

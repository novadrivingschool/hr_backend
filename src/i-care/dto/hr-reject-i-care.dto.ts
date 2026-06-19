// dto/hr-reject-i-care.dto.ts
import { Type } from 'class-transformer';
import {
  IsArray, IsObject, IsOptional, IsString,
  MaxLength, ValidateNested,
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

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  attachments?: string[];
}

// dto/coordinator-reject-i-care.dto.ts
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
 * DTO para que el coordinator rechace un iCare en estado pending.
 * El record pasa a rejection_under_review y se notifica a HR + Management.
 */
export class CoordinatorRejectICareDto {
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

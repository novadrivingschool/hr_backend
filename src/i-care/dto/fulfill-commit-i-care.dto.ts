// dto/fulfill-commit-i-care.dto.ts
import { Type } from 'class-transformer';
import {
  IsObject, IsOptional, IsString,
  MaxLength, ValidateNested,
} from 'class-validator';

class EmployeeRefDto {
  @IsString() name: string;
  @IsString() last_name: string;
  @IsString() employee_number: string;
  @IsString() nova_email: string;
}

/**
 * DTO para marcar el commit como cumplido (commit_fulfilled).
 * Coordinator/HR decide que no se necesitan más seguimientos.
 * Después de esto, HR puede marcar el iCare como SOLVED.
 */
export class FulfillCommitICareDto {
  @IsObject()
  @ValidateNested()
  @Type(() => EmployeeRefDto)
  fulfilled_by: EmployeeRefDto;

  /** Fecha real en que se realizó el último seguimiento (YYYY-MM-DD) */
  @IsOptional()
  @IsString()
  actual_date?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

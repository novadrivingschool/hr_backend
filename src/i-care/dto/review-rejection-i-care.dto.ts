// dto/review-rejection-i-care.dto.ts
import { Type } from 'class-transformer';
import {
  IsArray, IsBoolean, IsEnum, IsObject, IsOptional, IsString,
  MaxLength, ValidateNested,
} from 'class-validator';
import { ICareUrgency } from '../entities/i-care.entity';

class EmployeeRefDto {
  @IsString() name: string;
  @IsString() last_name: string;
  @IsString() employee_number: string;
  @IsString() nova_email: string;
}

/**
 * DTO para que HR / Management revise el rejected del coordinator.
 * accept = true  → el iCare queda como rejected final.
 * accept = false → override: HR/Mgmt asigna la urgency final (requerida).
 *                  Low/Medium    → status vuelve a PENDING (coordinator solo puede justificar).
 *                  High/Critical → status pasa a PENDING_HR_JUSTIFY (se queda con HR/Mgmt).
 */
export class ReviewRejectionICareDto {
  @IsObject()
  @ValidateNested()
  @Type(() => EmployeeRefDto)
  reviewed_by: EmployeeRefDto;

  /** true = aceptar el rejected | false = rechazar el rejected (override) */
  @IsBoolean()
  accept: boolean;

  /** Requerida cuando accept=false. Determina el flujo post-override. */
  @IsOptional()
  @IsEnum(ICareUrgency)
  urgency?: ICareUrgency;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  attachments?: string[];
}

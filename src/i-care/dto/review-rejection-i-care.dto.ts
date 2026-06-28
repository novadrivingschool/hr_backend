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
 * accept = false → se hace override: HR/Mgmt asigna urgency y el record vuelve a IN_PROGRESS.
 *                  Low/Med → flujo coordinator normal. High/Critical → HR/Mgmt.
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

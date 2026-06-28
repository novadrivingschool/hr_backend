// dto/justify-i-care.dto.ts
import { Type } from 'class-transformer';
import {
  IsArray, IsBoolean, IsEnum, IsObject, IsOptional,
  IsString, ValidateNested,
} from 'class-validator';
import { ICareUrgency } from '../entities/i-care.entity';

class EmployeeRefDto {
  @IsString() name: string;
  @IsString() last_name: string;
  @IsString() employee_number: string;
  @IsString() nova_email: string;
  @IsOptional() @IsArray() @IsString({ each: true }) roles?: string[];
}

export class JustifyICareDto {
  @IsBoolean()
  justified: boolean;

  @IsObject()
  @ValidateNested()
  @Type(() => EmployeeRefDto)
  approved_by: EmployeeRefDto;

  /** Urgency asignada por el coordinator al aprobar. Requerida cuando justified=true. */
  @IsOptional()
  @IsEnum(ICareUrgency)
  urgency?: ICareUrgency;

  @IsOptional()
  @IsString()
  comment?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  attachments?: string[];

  @IsOptional()
  @IsString()
  caller_role?: string;
}

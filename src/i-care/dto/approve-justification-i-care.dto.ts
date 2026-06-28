import { Type } from 'class-transformer';
import { IsArray, IsEnum, IsIn, IsObject, IsOptional, IsString, ValidateNested } from 'class-validator';
import { ICareUrgency } from '../entities/i-care.entity';

class EmployeeRefDto {
  @IsString() name: string;
  @IsString() last_name: string;
  @IsString() employee_number: string;
  @IsString() nova_email: string;
}

export class ApproveJustificationICareDto {
  /** accept = HR/Mgmt justifica con urgency elegida → in_progress | reject = rechaza definitivo */
  @IsIn(['accept', 'reject'])
  action: 'accept' | 'reject';

  /** Requerido cuando action = 'accept'. Urgency final que establece HR/Management. */
  @IsOptional()
  @IsEnum(ICareUrgency)
  urgency?: ICareUrgency;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsObject()
  @ValidateNested()
  @Type(() => EmployeeRefDto)
  reviewed_by: EmployeeRefDto;

  @IsOptional()
  @IsString()
  caller_role?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  attachments?: string[];
}

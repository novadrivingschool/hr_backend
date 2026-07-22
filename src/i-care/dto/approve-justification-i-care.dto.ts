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
  /**
   * accept     = HR/Mgmt confirma la urgency H/C tal cual → in_progress (HR/Mgmt gestiona el seguimiento)
   * downgrade  = HR/Mgmt baja la urgency a Low/Medium → vuelve a status 'pending' con el coordinator,
   *              quien debe completar su propio Justify (igual que cualquier caso L/M nuevo)
   * reject     = rechaza definitivo
   */
  @IsIn(['accept', 'downgrade', 'reject'])
  action: 'accept' | 'downgrade' | 'reject';

  /** Requerido cuando action = 'accept' (cualquier urgency) o 'downgrade' (debe ser Low o Medium). */
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

// dto/approve-commit-i-care.dto.ts
import { Type } from 'class-transformer';
import {
  IsArray, IsBoolean, IsObject, IsOptional, IsString,
  Matches, MaxLength, ValidateNested,
} from 'class-validator';

class EmployeeRefDto {
  @IsString() name: string;
  @IsString() last_name: string;
  @IsString() employee_number: string;
  @IsString() nova_email: string;
}

/**
 * DTO para aprobar el commit del staff y asignar el primer seguimiento.
 * Usado por el Coordinator (Low/Medium) o HR/Management (cualquier urgencia).
 */
export class ApproveCommitICareDto {
  @IsObject()
  @ValidateNested()
  @Type(() => EmployeeRefDto)
  approved_by: EmployeeRefDto;

  /** Fecha del primer seguimiento programado (YYYY-MM-DD) */
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'scheduled_date must be in YYYY-MM-DD format',
  })
  scheduled_date: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  /**
   * Cuando es true, indica que el coordinator/HR eligió "fulfill directo".
   * El servicio omitirá el email 'commit_approved' y dejará que
   * el llamado posterior a fulfillCommit dispare 'commit_fulfilled'.
   */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  attachments?: string[];

  @IsOptional()
  @IsBoolean()
  is_fulfill_direct?: boolean;
}

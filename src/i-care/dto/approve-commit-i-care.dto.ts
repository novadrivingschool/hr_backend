// dto/approve-commit-i-care.dto.ts
import { Type } from 'class-transformer';
import {
  IsArray, IsBoolean, IsIn, IsObject, IsOptional, IsString,
  Matches, ValidateNested,
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

  // 2026-08-20: @MaxLength(2000) removed at the user's explicit request
  // ("no puedes dejar solo 2 mil, déjalo libre") — was rejecting real
  // write-ups with a 400. Old declaration kept for reference: @MaxLength(2000)
  @IsOptional()
  @IsString()
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
  @IsOptional()
  @IsBoolean()
  is_fulfill_direct?: boolean;

  @IsOptional()
  @IsString()
  caller_role?: string;

  /**
   * 2026-08-23: when true, this call is the tail end of the Coaching
   * Session bundle (ICare.vue submitJustify()) on the follow-up path
   * (!is_fulfill_direct) — the service fires 'coaching_session_completed_*'
   * instead of 'seguimiento_added_*', so recipients get ONE clearly-labeled
   * email for the whole session instead of something that reads like a
   * routine follow-up. Left false for the standalone approveCommitDialog
   * (recovery tool) and any future non-bundled caller, which keep firing
   * the normal 'seguimiento_added_*' as before.
   */
  @IsOptional()
  @IsBoolean()
  coaching_session_bundle?: boolean;
}

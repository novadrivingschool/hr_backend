// dto/fulfill-commit-i-care.dto.ts
import { Type } from 'class-transformer';
import {
  IsArray, IsBoolean, IsIn, IsObject, IsOptional, IsString,
  ValidateNested,
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

  // 2026-08-20: @MaxLength(2000) removed at the user's explicit request
  // ("no puedes dejar solo 2 mil, déjalo libre") — was rejecting real
  // write-ups with a 400. Old declaration kept for reference: @MaxLength(2000)
  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  attachments?: string[];

  @IsOptional()
  @IsString()
  caller_role?: string;

  /**
   * 2026-08-23: see ApproveCommitICareDto.coaching_session_bundle — same
   * reasoning, but for the fulfill-direct path of the Coaching Session
   * bundle. When true, fires 'coaching_session_completed_*' instead of
   * 'commit_fulfilled_*'. Left false for a real, later "Mark Fulfilled"
   * from the standalone seguimientoDialog/approveCommitDialog, which keep
   * firing the normal 'commit_fulfilled_*' as before.
   */
  @IsOptional()
  @IsBoolean()
  coaching_session_bundle?: boolean;
}

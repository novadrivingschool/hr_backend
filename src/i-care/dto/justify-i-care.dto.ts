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

  /**
   * 2026-08-22: when true, justify() records the decision but does NOT fire
   * the 'justified_*' emails. Set by the frontend's Coaching Session bundle
   * (ICare.vue submitJustify(), the justified=true && !justifyWillEscalate
   * path) because commit() + approveCommit()/fulfillCommit() are called
   * immediately after in the same submit — sending a 'justified' email here
   * would just be the first of three near-duplicate notifications for what
   * the UI now presents as a single action. The final call in that chain
   * (approveCommit → seguimiento_added, or fulfillCommit → commit_fulfilled)
   * is the one that actually notifies people. Left false/omitted for any
   * other caller (reject, escalate-to-HR, or a future standalone justify),
   * so those keep notifying immediately as before.
   */
  @IsOptional()
  @IsBoolean()
  skip_notification?: boolean;
}

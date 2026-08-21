import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';

/**
 * DTO used to record the staff commitment on an iCare record.
 *
 * NOTE (was, kept for reference): "All fields are optional so the endpoint
 * can also be used to un-commit (set committed = false) or to update notes
 * later." — that was never actually true: `committed` has always been a
 * required @IsBoolean() below despite this comment. Left as documentation
 * of the pre-existing inconsistency, not because it's still accurate.
 *
 * 2026-08-19 workflow change ("Coaching Session"): the staff commitment is
 * now normally captured by the coordinator (or HR/Management acting as
 * coordinator on High/Critical cases) in the same dialog as their Justify
 * step — see ICare.vue's justifyDialog/submitJustify on the frontend. This
 * DTO/endpoint itself is unchanged in shape; only the caller changed. New
 * rule added below: evidence is mandatory whenever there are commit notes.
 */
export class CommitICareDto {
  /**
   * Toggle commitment on/off.
   */
  @IsBoolean()
  committed: boolean;

  /**
   * Date of commitment in YYYY-MM-DD format.
   * When omitted the service automatically uses today's date.
   */
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'committed_date must be in YYYY-MM-DD format',
  })
  committed_date?: string;

  /**
   * Time of commitment in HH:mm (24-h) format.
   * When omitted the service automatically uses the current time.
   */
  @IsOptional()
  @IsString()
  @Matches(/^\d{2}:\d{2}$/, {
    message: 'committed_time must be in HH:mm format',
  })
  committed_time?: string;

  /**
   * Optional free-text message written by the staff member.
   */
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  committed_notes?: string;

  // 2026-08-19 workflow change: evidence becomes mandatory as soon as there
  // are commit notes (was fully optional before, independent of notes).
  // Old declaration kept commented for reference in case this needs to revert:
  // @IsOptional()
  // @IsArray()
  // committed_attachments?: string[];
  // @ValidateIf() below conditionally applies @IsArray/@ArrayMinSize only
  // when committed_notes is present — when there are no notes the field
  // stays fully optional (condition false => validators skipped), so no
  // separate @IsOptional() is needed (would conflict/be redundant here).
  @ValidateIf((o) => !!o.committed_notes && o.committed_notes.trim().length > 0)
  @IsArray()
  @ArrayMinSize(1, {
    message: 'committed_attachments is required when committed_notes is provided',
  })
  committed_attachments?: string[];
}
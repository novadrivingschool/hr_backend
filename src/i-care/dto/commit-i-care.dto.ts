import {
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

/**
 * DTO used when a staff member marks an iCare record as "committed".
 * All fields are optional so the endpoint can also be used to un-commit
 * (set committed = false) or to update notes later.
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

  @IsOptional()
  @IsArray()
  committed_attachments?: string[];
}
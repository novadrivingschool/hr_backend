import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

const toNullableString = ({ value }: { value: unknown }) => {
  if (value === undefined || value === null) return null;
  const normalized = String(value).trim();
  return normalized.length ? normalized : null;
};

const toNumberValue = ({ value }: { value: unknown }) => {
  if (value === undefined || value === null || value === '') return 0;
  const normalized = String(value).replace(/,/g, '').trim();
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
};

// 24h (H:MM[:SS]) o 12h con AM/PM — los mismos formatos que acepta la comparación
// TCW vs Activity (toHHMMSS en PayrollService).
const CLOCK_TIME_REGEX = /^(?:[01]?\d|2[0-3]):[0-5]\d(?::[0-5]\d)?(?:\s?[AaPp][Mm])?$/;
const CLOCK_TIME_MESSAGE = 'must be a valid time (HH:MM or HH:MM:SS)';

export class CreateTimesheetRecordDto {
  @IsString()
  @MaxLength(150)
  employee: string;

  @IsOptional()
  @Transform(toNullableString)
  @IsString()
  @MaxLength(50)
  hour_type?: string | null;

  @IsDateString()
  day_date: string;

  @IsOptional()
  @Transform(toNullableString)
  @IsString()
  @MaxLength(120)
  day_date_raw?: string | null;

  @IsOptional()
  @Transform(toNullableString)
  @IsString()
  @MaxLength(20)
  @Matches(CLOCK_TIME_REGEX, { message: CLOCK_TIME_MESSAGE })
  time_in?: string | null;

  @IsOptional()
  @Transform(toNullableString)
  @IsString()
  @MaxLength(20)
  @Matches(CLOCK_TIME_REGEX, { message: CLOCK_TIME_MESSAGE })
  time_out?: string | null;

  @IsOptional()
  @Transform(toNumberValue)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(24)
  hours?: number;

  @IsOptional()
  @Transform(toNumberValue)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  paid_break?: number;

  @IsOptional()
  @Transform(toNumberValue)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  unpaid_break?: number;

  @IsOptional()
  @Transform(toNumberValue)
  @IsNumber({ maxDecimalPlaces: 2 })
  day_wise_total_hours?: number;

  @IsOptional()
  @Transform(toNumberValue)
  @IsNumber({ maxDecimalPlaces: 2 })
  total_hours?: number;

  @IsOptional()
  @Transform(toNumberValue)
  @IsNumber({ maxDecimalPlaces: 2 })
  total_paid_break?: number;

  @IsOptional()
  @Transform(toNumberValue)
  @IsNumber({ maxDecimalPlaces: 2 })
  total_unpaid_break?: number;

  @IsOptional()
  @Transform(toNumberValue)
  @IsNumber({ maxDecimalPlaces: 2 })
  total_day_wise_total_hours?: number;
}

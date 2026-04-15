import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, IsUUID } from 'class-validator';

const toNullableString = ({ value }: { value: unknown }) => {
  if (value === undefined || value === null) return undefined;
  const normalized = String(value).trim();
  return normalized.length ? normalized : undefined;
};

export class ImportTimesheetCsvDto {
  @IsOptional()
  @Transform(toNullableString)
  @IsIn(['employee_day', 'date_range', 'append'])
  replace_mode?: 'employee_day' | 'date_range' | 'append';

  @IsOptional()
  @Transform(toNullableString)
  @IsString()
  source_file_name?: string;

  @IsOptional()
  @Transform(toNullableString)
  @IsUUID()
  import_batch_id?: string;
}

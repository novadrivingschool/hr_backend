import { IsOptional, IsString, IsDateString } from 'class-validator';

export class FilterLogbookDto {
  @IsOptional()
  @IsString()
  employee_number?: string;

  @IsOptional()
  @IsString()
  section?: string;

  @IsOptional()
  @IsDateString()
  date_from?: string;

  @IsOptional()
  @IsDateString()
  date_to?: string;
}

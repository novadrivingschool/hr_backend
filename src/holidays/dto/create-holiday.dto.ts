import { IsBoolean, IsDateString, IsObject, IsOptional, IsString, Length } from 'class-validator';

export class PerformedByDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  last_name?: string;

  @IsOptional()
  @IsString()
  employee_number?: string;
}

export class CreateHolidayDto {
  @IsString()
  @Length(2, 150)
  name: string;

  @IsDateString()
  date: string;

  @IsOptional()
  @IsString()
  @Length(2, 50)
  type?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;

  @IsOptional()
  @IsObject()
  performed_by?: PerformedByDto;
}
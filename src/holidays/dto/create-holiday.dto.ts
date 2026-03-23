import { IsBoolean, IsDateString, IsOptional, IsString, Length } from 'class-validator';

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
}
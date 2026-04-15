import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { RegisterEnum } from 'src/schedule_event/entities/register.enum';

export class FilterSchedulePanelDto {
  @IsDateString()
  start_date: string;

  @IsDateString()
  end_date: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  employee_number?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  departments?: string[];

  @IsOptional()
  @IsArray()
  @IsEnum(RegisterEnum, { each: true })
  register?: RegisterEnum[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  location?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  services?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  restrictions?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  vehicle_drop?: string[];

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  strict?: boolean;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isFixed?: boolean;
}
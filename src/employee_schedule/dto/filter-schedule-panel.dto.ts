// src/employee_schedule/dto/filter-schedule-panel.dto.ts
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
} from 'class-validator';
import { Type } from 'class-transformer';
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
  @Type(() => Boolean)
  @IsBoolean()
  strict?: boolean;

  // undefined => todos
  // true      => solo fixed
  // false     => solo variables
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isFixed?: boolean;
}
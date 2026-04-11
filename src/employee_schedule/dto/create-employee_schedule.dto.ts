import {
  IsArray,
  IsNotEmpty,
  IsString,
  IsOptional,
  ValidateNested,
  IsNumber,
  IsUUID,
  IsEnum,
  IsBoolean,
  ValidateIf,
} from 'class-validator';
import { Type } from 'class-transformer';
import { RegisterEnum } from 'src/schedule_event/entities/register.enum';

export class CreateFixedScheduleDto {
  @IsOptional()
  @IsNumber()
  id: number;

  @IsArray()
  weekdays: number[];

  @IsString()
  start: string;

  @IsString()
  end: string;

  @IsEnum(RegisterEnum)
  register: RegisterEnum;

  @IsArray()
  @IsString({ each: true })
  location: string[];

  @IsOptional()
  @IsBoolean()
  strict?: boolean;
}

export class CreateTimeOffRecoverySlotDto {
  @IsString()
  date: string;

  @IsString()
  start: string;

  @IsString()
  end: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  location?: string[];

  @IsOptional()
  @IsBoolean()
  strict?: boolean;
}

export class CreateScheduleEventDto {
  @IsOptional()
  @IsNumber()
  id: number;

  @IsString()
  date: string;

  /* @IsString()
  start: string;

  @IsString()
  end: string; */
  @ValidateIf(o => o.register !== RegisterEnum.OFF)
  @IsString()
  start: string;

  @ValidateIf(o => o.register !== RegisterEnum.OFF)
  @IsString()
  end: string;

  @IsEnum(RegisterEnum)
  register: RegisterEnum;

  @IsArray()
  @IsString({ each: true })
  location: string[];

  @IsOptional()
  @IsUUID()
  uuid_tor: string | null;

  @IsOptional()
  @IsUUID()
  uuid_extra_hours: string | null;

  @IsOptional()
  @IsBoolean()
  strict?: boolean;

  // Solo aplica cuando register === TIME_OFF_REQUEST
  @IsOptional()
  @IsBoolean()
  is_paid?: boolean;

  @IsOptional()
  @IsBoolean()
  will_make_up_hours?: boolean;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateTimeOffRecoverySlotDto)
  make_up_schedule?: CreateTimeOffRecoverySlotDto[];
}

export class CreateEmployeeScheduleDto {
  @IsNotEmpty()
  @IsString()
  employee_number: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateFixedScheduleDto)
  fixed: CreateFixedScheduleDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateScheduleEventDto)
  events: CreateScheduleEventDto[];
}

export class CreateBulkScheduleDto {
  @IsNotEmpty()
  @IsArray()
  @IsString({ each: true })
  employee_numbers: string[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateFixedScheduleDto)
  fixed: CreateFixedScheduleDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateScheduleEventDto)
  events: CreateScheduleEventDto[];
}
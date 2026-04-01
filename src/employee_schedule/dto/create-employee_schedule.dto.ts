import {
    IsArray,
    IsNotEmpty,
    IsString,
    IsOptional,
    ValidateNested,
    IsNumber,
    IsUUID,
    IsEnum,
    IsBoolean
} from 'class-validator';
import { Type } from 'class-transformer';
import { RegisterEnum } from 'src/schedule_event/entities/register.enum';


class CreateFixedScheduleDto {
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

class CreateScheduleEventDto {
    @IsOptional()
    @IsNumber()
    id: number;

    @IsString()
    date: string;

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
    @IsUUID()
    uuid_tor: string | null;

    @IsOptional()
    @IsUUID()
    uuid_extra_hours: string | null;

    @IsOptional()
    @IsBoolean()
    strict?: boolean;
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
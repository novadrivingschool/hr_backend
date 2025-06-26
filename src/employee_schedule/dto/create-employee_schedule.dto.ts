import {
    IsArray,
    IsNotEmpty,
    IsString,
    IsOptional,
    ValidateNested,
    IsNumber
} from 'class-validator';
import { Type } from 'class-transformer';

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

    @IsString()
    register: string;

    @IsString()
    location: string;
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

    @IsString()
    register: string;

    @IsString()
    location: string;
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

import {
    IsArray,
    IsBoolean,
    IsDefined,
    IsEnum,
    IsNotEmpty,
    IsObject,
    IsOptional,
    IsString,
    Matches,
    ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { LoaTypeEnum } from '../enums';

/** Snapshot del empleado resuelto por live search. Mismo shape en toda la app (ver i-care). */
export class LoaEmployeeSnapshotDto {
    @IsString()
    @IsNotEmpty()
    name: string;

    @IsString()
    @IsNotEmpty()
    last_name: string;

    @IsString()
    @IsNotEmpty()
    employee_number: string;

    @IsOptional()
    @IsString()
    nova_email?: string;

    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    multi_department?: string[];
}

/** Quién hizo la acción. */
export class LoaActorDto {
    @IsString()
    @IsNotEmpty()
    name: string;

    @IsString()
    @IsNotEmpty()
    last_name: string;

    @IsString()
    @IsNotEmpty()
    employee_number: string;

    @IsOptional()
    @IsString()
    nova_email?: string;
}

export class CreateLeaveOfAbsenceDto {
    @IsString()
    @IsNotEmpty()
    employee_number: string;

    @IsDefined({ message: 'employee_data is required' })
    @IsObject()
    @ValidateNested()
    @Type(() => LoaEmployeeSnapshotDto)
    employee_data: LoaEmployeeSnapshotDto;

    @IsString()
    @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'startDate must be YYYY-MM-DD' })
    startDate: string;

    @IsString()
    @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'endDate must be YYYY-MM-DD' })
    endDate: string;

    @IsOptional()
    @IsString()
    @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'returnDate must be YYYY-MM-DD' })
    returnDate?: string;

    @IsEnum(LoaTypeEnum, {
        message: `loaType must be one of: ${Object.values(LoaTypeEnum).join(', ')}`,
    })
    loaType: LoaTypeEnum;

    @IsOptional()
    @IsString()
    notes?: string;

    /** Desmarcado (false) si no se envía. */
    @IsOptional()
    @IsBoolean()
    registeredInInspirity?: boolean;

    @IsOptional()
    @IsBoolean()
    wellnessPackages?: boolean;

    /** Keys de S3 devueltas por leave-of-absence/files/upload (aws_services_backend). */
    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    attachments?: string[];

    @IsDefined({ message: 'created_by is required' })
    @IsObject()
    @ValidateNested()
    @Type(() => LoaActorDto)
    created_by: LoaActorDto;
}

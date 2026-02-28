import {
    IsArray,
    IsString,
    IsNotEmpty,
    IsOptional,
    ValidateNested,
    IsDateString,
    IsObject
} from "class-validator";
import { Type } from "class-transformer";

export class ResponsibleDto {
    @IsString()
    @IsNotEmpty()
    full_name: string;

    @IsString()
    @IsNotEmpty()
    employee_number: string;
}

export class EmployeeDto {

    @IsString()
    @IsNotEmpty()
    full_name: string;

    @IsString()
    @IsNotEmpty()
    employee_number: string;

    @IsArray()
    @IsString({ each: true })
    multi_position: string[];

    @IsArray()
    @IsString({ each: true })
    multi_department: string[];
}

export class RecipientDto extends EmployeeDto {
    @IsObject()
    @ValidateNested()
    @Type(() => ResponsibleDto)
    responsible: ResponsibleDto;

    @IsArray()
    @IsString({each:true})
    multi_type_of_staff: string[]
}

export class CreateShoutOutDto {
    @IsDateString() 
    created_date: string;

    @IsObject()
    @ValidateNested()
    @Type(() => EmployeeDto)
    sender: EmployeeDto;

    @IsObject()
    @ValidateNested()
    @Type(() => RecipientDto)
    person_to: RecipientDto;

    @IsArray()
    @IsString({ each: true })
    reasons: string[]; 

    @IsString()
    @IsOptional()
    comments: string;
}
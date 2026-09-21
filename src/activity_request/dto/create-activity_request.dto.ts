import { Transform, Type } from 'class-transformer';
import { IsOptional, IsString, ValidateNested, IsEnum, IsArray, IsBoolean } from 'class-validator';
import { PunchTypeEnum, SourceEnum, StatusEnum } from '../enums';

class EmployeeDataDto {
    @IsString()
    name: string;
    @IsString()
    last_name: string;
    @IsString()
    employee_number: string;
    @IsArray()
    @IsString({ each: true })
    multi_department: string[];
    @IsArray()
    @IsString({ each: true })
    multi_company: string[];
    @IsArray()
    @IsString({ each: true })
    multi_location: string[];
    @IsString()
    nova_email: string;
}

class ApprovalDto {
    @IsBoolean()
    approved: boolean;
    @IsString()
    by: string;
    @IsString()
    date: string;
    @IsString()
    time: string;
}

export class CreateActivityRequestDto {
    @IsOptional()
    @IsString()
    id: string;

    @IsEnum(PunchTypeEnum)
    punchType: PunchTypeEnum;

    @IsEnum(SourceEnum)
    source: SourceEnum;

    @IsString()
    requestedDate: string;

    @IsString()
    reason: string;

    @IsOptional()
    @IsEnum(StatusEnum)
    @Transform(({ value }) => {
        const v = String(value ?? '').toLowerCase();
        if (v === 'approved') return StatusEnum.Approved;
        if (v === 'not approved') return StatusEnum.NotApproved;
        return StatusEnum.Pending;
    })
    status?: StatusEnum;

    @ValidateNested()
    @Type(() => EmployeeDataDto)
    employee_data: EmployeeDataDto;

    @IsOptional()
    @ValidateNested()
    @Type(() => ApprovalDto)
    coordinator_approval?: ApprovalDto;

    @IsOptional()
    @ValidateNested()
    @Type(() => ApprovalDto)
    hr_approval?: ApprovalDto;

    @IsOptional()
    @IsString()
    coordinator_comments?: string;

    @IsOptional()
    @IsString()
    hr_comments?: string;
}

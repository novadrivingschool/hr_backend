import { Transform, Type } from 'class-transformer';
import { IsOptional, IsString, IsIn, ValidateNested, IsBoolean } from 'class-validator';


class EmployeeDataDto {
    @IsString()
    name: string;

    @IsString()
    last_name: string;

    @IsString()
    employee_number: string;

    @IsString()
    department: string;

    @IsString()
    country: string;

    @IsString()
    company: string;
}

class ApprovalDto {
    @IsBoolean()
    approved: boolean;

    @IsString()
    by: string;

    @IsString()
    date: string;  // fecha en formato YYYY-MM-DD

    @IsString()
    time: string;  // hora en formato HH:mm:ss
}

export class CreateTimeOffRequestDto {
    @IsIn(['Days', 'Hours'])
    timeType: string;

    @IsOptional()
    @IsString()
    startTime?: string;

    @IsOptional()
    @Transform(({ value }) => value || null)
    @IsString()
    endTime?: string;

    @IsOptional()
    @Transform(({ value }) => value || null)
    @IsString()
    hourDate?: string;

    @IsOptional()
    @Transform(({ value }) => value || null)
    @IsString()
    startDate?: string;

    @IsOptional()
    @IsString()
    endDate?: string;

    @IsIn([
        'Vacation',
        'Personal Leave',
        'Jury Duty',
        'Doctor’s Appointment',
        'Family and Medical Leave',
        'Other'
    ])
    requestType: string;

    @IsOptional()
    @IsString()
    otherDescription?: string;

    @IsOptional()
    @IsString()
    comments?: string;

    @IsString()
    dateOrRange: string;

    @IsOptional()
    @IsIn(['Pending', 'Approved', 'Not Approved'])
    status?: 'Pending' | 'Approved' | 'Not Approved';

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

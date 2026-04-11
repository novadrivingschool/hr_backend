import { Transform, Type } from 'class-transformer';
import { IsOptional, IsString, IsIn, ValidateNested, IsBoolean, IsArray, IsEnum } from 'class-validator';
import { StatusEnum, TimeTypeEnum } from '../enums';


class EmployeeDataDto {
    @IsString()
    name: string;

    @IsString()
    last_name: string;

    @IsString()
    employee_number: string;

    /* @IsString()
    department: string; */
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
    date: string;  // fecha en formato YYYY-MM-DD

    @IsString()
    time: string;  // hora en formato HH:mm:ss
}

class RecoveryEntryDto {
    @IsString()
    date: string;           // YYYY-MM-DD

    @IsString()
    startTime: string;      // HH:mm

    @IsString()
    endTime: string;        // HH:mm
}

export class CreateTimeOffRequestDto {
    @IsOptional()
    @IsString()
    id: string;

    /* @IsIn(['Days', 'Hours'])
    timeType: string; */
    @IsEnum(TimeTypeEnum)
    @Transform(({ value }) => (String(value || '').toLowerCase() === 'hours' ? TimeTypeEnum.Hours : TimeTypeEnum.Days))
    timeType: TimeTypeEnum;

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

    /* @IsOptional()
    @IsIn(['Pending', 'Approved', 'Not Approved'])
    status?: 'Pending' | 'Approved' | 'Not Approved'; */
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

    // ── Pago ──────────────────────────────────────────────────────────────────
    @IsOptional()
    @IsBoolean()
    @Transform(({ value }) => value === true || value === 'true')
    is_paid?: boolean;

    // ── Recuperación ──────────────────────────────────────────────────────────
    @IsOptional()
    @IsBoolean()
    @Transform(({ value }) => value === true || value === 'true')
    recovery_required?: boolean;

    /**
     * Solo se valida si recovery_required es true.
     * El frontend envía el arreglo; si no aplica, manda null / omite el campo.
     */
    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => RecoveryEntryDto)
    recovery_schedule?: RecoveryEntryDto[] | null;
}

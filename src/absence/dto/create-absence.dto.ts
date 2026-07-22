import {
    IsArray,
    IsBoolean,
    IsDefined,
    IsEnum,
    IsIn,
    IsNotEmpty,
    IsObject,
    IsOptional,
    IsString,
    ValidateIf,
    ValidateNested,
    Matches,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
    ABSENCE_END_OPTIONAL_REASONS,
    ABSENCE_REASONS,
    AbsenceTimeTypeEnum,
} from '../enums';

export class AbsenceEmployeeDataDto {
    @IsString()
    @IsNotEmpty()
    name: string;

    @IsString()
    @IsNotEmpty()
    last_name: string;

    @IsString()
    @IsNotEmpty()
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

    @IsOptional()
    @IsString()
    nova_email?: string;
}

export class CreateAbsenceDto {
    @IsEnum(AbsenceTimeTypeEnum)
    timeType: AbsenceTimeTypeEnum;

    /**
     * A diferencia de schedule_event.reason (que hoy acepta cualquier string),
     * aquí sí se valida contra el catálogo.
     */
    @IsIn(ABSENCE_REASONS as unknown as string[], {
        message: `requestType must be one of: ${ABSENCE_REASONS.join(', ')}`,
    })
    requestType: string;

    // ── Flujo Days ───────────────────────────────────────────────────────────────
    @ValidateIf(o => o.timeType === AbsenceTimeTypeEnum.Days)
    @IsString()
    @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'startDate must be YYYY-MM-DD' })
    startDate?: string;

    @ValidateIf(o => o.timeType === AbsenceTimeTypeEnum.Days)
    @IsString()
    @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'endDate must be YYYY-MM-DD' })
    endDate?: string;

    // ── Flujo Hours ──────────────────────────────────────────────────────────────
    @ValidateIf(o => o.timeType === AbsenceTimeTypeEnum.Hours)
    @IsString()
    @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'hourDate must be YYYY-MM-DD' })
    hourDate?: string;

    @ValidateIf(o => o.timeType === AbsenceTimeTypeEnum.Hours)
    @IsString()
    @Matches(/^\d{1,2}:\d{2}(:\d{2})?$/, { message: 'startTime must be HH:mm' })
    startTime?: string;

    /**
     * endTime es obligatorio salvo que la razón sea 'No Internet' o 'Power Outage',
     * donde el empleado puede dejar el outage abierto. Si lo captura, se respeta.
     * Espeja la regla de CreateScheduleEventDto.end.
     */
    @ValidateIf(
        o =>
            o.timeType === AbsenceTimeTypeEnum.Hours &&
            !ABSENCE_END_OPTIONAL_REASONS.includes(o.requestType),
    )
    @IsString()
    @Matches(/^\d{1,2}:\d{2}(:\d{2})?$/, { message: 'endTime must be HH:mm' })
    endTime?: string;

    @IsOptional()
    @IsString()
    comments?: string;

    @IsString()
    @IsNotEmpty()
    dateOrRange: string;

    /**
     * @IsDefined + @IsObject son necesarios: @ValidateNested por sí solo no
     * falla cuando la propiedad viene ausente, y employee_data es NOT NULL.
     */
    @IsDefined({ message: 'employee_data is required' })
    @IsObject()
    @ValidateNested()
    @Type(() => AbsenceEmployeeDataDto)
    employee_data: AbsenceEmployeeDataDto;

    /**
     * Aceptados por paridad con TOR pero no expuestos en el formulario.
     * Una absence no se paga ni autoriza recuperación de horas.
     */
    @IsOptional()
    @IsBoolean()
    is_paid?: boolean;

    @IsOptional()
    @IsBoolean()
    recovery_required?: boolean;
}

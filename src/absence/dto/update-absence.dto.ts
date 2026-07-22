import { OmitType, PartialType } from '@nestjs/mapped-types';
import { CreateAbsenceDto } from './create-absence.dto';

/**
 * employee_data se omite a propósito.
 *
 * En TOR, UpdateTimeOffRequestDto es un PartialType() completo, así que un PATCH
 * puede reasignar el request a otro empleado. Aquí el dueño de la absence es
 * inmutable después de crearla.
 */
export class UpdateAbsenceDto extends PartialType(
    OmitType(CreateAbsenceDto, ['employee_data'] as const),
) { }

export class CancelAbsenceDto {
    /** employee_number o nombre de quien cancela. */
    cancelled_by?: string;

    role?: 'staff' | 'hr' | 'coordinator' | 'management';

    reason?: string;
}

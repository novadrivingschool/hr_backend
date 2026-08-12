import { OmitType, PartialType } from '@nestjs/mapped-types';
import { IsDefined, IsObject, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { CreateLeaveOfAbsenceDto, LoaActorDto } from './create-leave-of-absence.dto';

/**
 * created_by se omite a propósito: el creador original de un LOA es inmutable
 * después del alta. updated_by sí es obligatorio en cada PATCH — mismo criterio
 * de auditoría que el resto de hr_backend (ver i-care: cada transición de
 * estado exige su propio actor).
 */
export class UpdateLeaveOfAbsenceDto extends PartialType(
    OmitType(CreateLeaveOfAbsenceDto, ['created_by'] as const),
) {
    @IsDefined({ message: 'updated_by is required' })
    @IsObject()
    @ValidateNested()
    @Type(() => LoaActorDto)
    updated_by: LoaActorDto;
}

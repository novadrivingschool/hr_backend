import { IsBoolean, IsDefined, IsObject, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { LoaActorDto } from './create-leave-of-absence.dto';

/**
 * HR marca su propia bitácora como "done" — solo permitido cuando los 5
 * deptos ya marcaron su "Temporary Offboarding done" (ver
 * LeaveOfAbsenceService.setHrDone).
 */
export class SetHrDoneDto {
    @IsBoolean()
    done: boolean;

    @IsDefined({ message: 'actor is required' })
    @IsObject()
    @ValidateNested()
    @Type(() => LoaActorDto)
    actor: LoaActorDto;
}

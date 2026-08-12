import { IsBoolean, IsDefined, IsObject, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { LoaActorDto } from './create-leave-of-absence.dto';

/**
 * Exclusivo de HR (loa-hr / management) — sin guard en el backend, mismo
 * criterio que el resto del módulo: el rol se valida en el frontend.
 */
export class MarkReturnedToWorkDto {
    @IsBoolean()
    returned_to_work: boolean;

    @IsDefined({ message: 'actor is required' })
    @IsObject()
    @ValidateNested()
    @Type(() => LoaActorDto)
    actor: LoaActorDto;
}

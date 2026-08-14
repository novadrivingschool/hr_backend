import { IsDefined, IsObject, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { LoaActorDto } from './create-leave-of-absence.dto';

/** Solo para auditoría (log) de quién borró la subtarea — no cambia el comportamiento del borrado. */
export class DeleteSubtaskDto {
    @IsDefined({ message: 'actor is required' })
    @IsObject()
    @ValidateNested()
    @Type(() => LoaActorDto)
    actor: LoaActorDto;
}

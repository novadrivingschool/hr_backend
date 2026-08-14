import { IsDefined, IsNotEmpty, IsObject, IsString, MaxLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { LoaActorDto } from './create-leave-of-absence.dto';

/**
 * Alta libre de una subtarea de "Temporary Offboarding" — el depto la
 * registra por caso, no viene de un catálogo. Un solo stage: ya no lleva
 * `phase` (el módulo ya no tiene reactivation).
 */
export class CreateSubtaskDto {
    @IsString()
    @IsNotEmpty()
    @MaxLength(300)
    label: string;

    @IsDefined({ message: 'actor is required' })
    @IsObject()
    @ValidateNested()
    @Type(() => LoaActorDto)
    actor: LoaActorDto;
}

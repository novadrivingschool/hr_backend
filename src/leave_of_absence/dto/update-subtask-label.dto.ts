import { IsDefined, IsNotEmpty, IsObject, IsString, MaxLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { LoaActorDto } from './create-leave-of-absence.dto';

export class UpdateSubtaskLabelDto {
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

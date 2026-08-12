import { IsBoolean, IsDefined, IsObject, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { LoaActorDto } from './create-leave-of-absence.dto';

export class SetDepartmentAttendedDto {
    @IsBoolean()
    attended: boolean;

    @IsDefined({ message: 'actor is required' })
    @IsObject()
    @ValidateNested()
    @Type(() => LoaActorDto)
    actor: LoaActorDto;
}

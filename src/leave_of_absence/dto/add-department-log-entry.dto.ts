import {
    ArrayMaxSize,
    IsArray,
    IsDefined,
    IsNotEmpty,
    IsObject,
    IsOptional,
    IsString,
    MaxLength,
    ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { LoaActorDto } from './create-leave-of-absence.dto';

export class AddDepartmentLogEntryDto {
    @IsString()
    @IsNotEmpty()
    @MaxLength(2000)
    comment: string;

    /** Keys de S3 devueltas por leave-of-absence/files/upload. Máx. 5 por comentario. */
    @IsOptional()
    @IsArray()
    @ArrayMaxSize(5, { message: 'Máximo 5 archivos por comentario' })
    @IsString({ each: true })
    attachments?: string[];

    @IsDefined({ message: 'added_by is required' })
    @IsObject()
    @ValidateNested()
    @Type(() => LoaActorDto)
    added_by: LoaActorDto;
}

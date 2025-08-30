// dto/find-by-roles.dto.ts
import { Transform } from 'class-transformer';
import { ArrayNotEmpty, IsArray, IsString } from 'class-validator';

export class FindByRolesDto {
    @Transform(({ value }) => {
        if (Array.isArray(value)) return value.flatMap((v) => String(v).split(','));
        if (typeof value === 'string') return value.split(',');
        return [];
    })
    @IsArray()
    @ArrayNotEmpty()
    @IsString({ each: true })
    departments: string[];
}

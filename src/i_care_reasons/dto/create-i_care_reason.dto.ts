import { IsString, IsNotEmpty, IsOptional, IsArray } from 'class-validator';

export class CreateICareReasonDto {
    @IsString()
    @IsNotEmpty()
    category: string;

    @IsString()
    @IsNotEmpty()
    reason: string;

    @IsString()
    @IsOptional()
    description?: string;

    @IsArray()
    @IsString({ each: true })
    @IsOptional()
    applies_to?: string[];
}

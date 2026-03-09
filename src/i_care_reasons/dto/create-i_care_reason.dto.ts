import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

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
}

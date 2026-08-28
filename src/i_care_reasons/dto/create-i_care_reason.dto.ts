import { IsString, IsNotEmpty, IsOptional, IsArray, IsEnum } from 'class-validator';
import { ICareUrgency } from '../../i-care/entities/i-care.entity';

export class CreateICareReasonDto {
    @IsString()
    @IsNotEmpty()
    category: string;

    @IsString()
    @IsNotEmpty()
    reason: string;

    @IsEnum(ICareUrgency)
    urgency: ICareUrgency;

    @IsString()
    @IsOptional()
    description?: string;

    @IsArray()
    @IsString({ each: true })
    @IsOptional()
    applies_to?: string[];
}

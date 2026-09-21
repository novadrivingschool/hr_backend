import { IsString, IsNotEmpty, IsOptional, IsArray, IsEnum } from 'class-validator';
import { ICareUrgency } from '../../i-care/entities/i-care.entity';
import { ICareOffenseCategory } from '../enums/offense-category.enum';

export class CreateICareReasonDto {
    @IsString()
    @IsNotEmpty()
    category: string;

    @IsString()
    @IsNotEmpty()
    reason: string;

    @IsEnum(ICareUrgency)
    urgency: ICareUrgency;

    // Opcional (placeholder, ver enums/offense-category.enum.ts)
    @IsEnum(ICareOffenseCategory)
    @IsOptional()
    offense_category?: ICareOffenseCategory;

    @IsString()
    @IsOptional()
    description?: string;

    @IsArray()
    @IsString({ each: true })
    @IsOptional()
    applies_to?: string[];
}

import { OmitType, PartialType } from '@nestjs/mapped-types';
import { CreateShoutOutDto, EmployeeDto, RecipientDto } from './create-shout_out.dto';
import { IsOptional, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateEmployeeDto extends PartialType(EmployeeDto){}
export class UpdateRecipientDto extends PartialType(RecipientDto){}

export class UpdateShoutOutDto extends PartialType(
    OmitType(CreateShoutOutDto, ['sender', 'person_to'] as const),
) {

    @IsOptional()
    @ValidateNested()
    @Type(()=>UpdateEmployeeDto)
    sender: UpdateEmployeeDto

    @IsOptional()
    @ValidateNested()
    @Type(()=>UpdateRecipientDto)
    person_to: UpdateRecipientDto
}

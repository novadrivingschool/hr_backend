// dto/justify-i-care.dto.ts
import { Type } from 'class-transformer';
import {
  IsBoolean, IsObject, IsOptional,
  IsString, ValidateNested,
} from 'class-validator';

class EmployeeRefDto {
  @IsString() name: string;
  @IsString() last_name: string;
  @IsString() employee_number: string;
  @IsString() nova_email: string;
}

export class JustifyICareDto {
  @IsBoolean()
  justified: boolean;

  @IsObject()
  @ValidateNested()
  @Type(() => EmployeeRefDto)
  approved_by: EmployeeRefDto;

  @IsOptional()
  @IsString()
  comment?: string;
}
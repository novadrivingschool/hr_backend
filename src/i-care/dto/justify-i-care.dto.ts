// dto/justify-i-care.dto.ts
import { Type } from 'class-transformer';
import {
  IsArray, IsBoolean, IsIn, IsObject, IsOptional,
  IsString, ValidateNested,
} from 'class-validator';

class EmployeeRefDto {
  @IsString() name: string;
  @IsString() last_name: string;
  @IsString() employee_number: string;
  @IsString() nova_email: string;
  @IsOptional() @IsArray() @IsString({ each: true }) roles?: string[];
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

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  attachments?: string[];

  @IsOptional()
  @IsString()
  caller_role?: string;
}

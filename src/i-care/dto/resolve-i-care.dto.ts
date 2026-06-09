// dto/resolve-i-care.dto.ts
import { Type } from 'class-transformer';
import { IsArray, IsObject, IsOptional, IsString, ValidateNested } from 'class-validator';

class EmployeeRefDto {
  @IsString() name: string;
  @IsString() last_name: string;
  @IsString() employee_number: string;
  @IsString() nova_email: string;
}

export class ResolveICareDto {
  @IsObject()
  @ValidateNested()
  @Type(() => EmployeeRefDto)
  resolved_by: EmployeeRefDto;

  @IsOptional()
  @IsString()
  resolved_notes?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  attachments?: string[];
}
import { IsNumber, IsOptional, IsString, IsNotEmpty } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateEmployeeAccountingDto {
  @IsString()
  @IsNotEmpty()
  employee_number: string;

  @IsOptional()
  @IsString()
  type_of_income?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  rate_office_staff?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  btw_rate?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  class_c_rate?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  cr_rate?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  ss_rate?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  training_rate?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  assignment_rate?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  commissions?: number;

  @IsOptional()
  @IsString()
  payment_method?: string;

  @IsOptional()
  @IsString()
  receives_comissions?: string;

  @IsOptional()
  @IsString()
  pay_frequency?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  office_maintenance?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  authorized_hours?: number;
}
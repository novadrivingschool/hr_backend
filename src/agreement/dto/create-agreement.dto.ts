import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEmail,
  IsDateString,
  IsObject,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class AgreementPersonDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  last_name: string;

  @IsString()
  @IsNotEmpty()
  employee_number: string;

  @IsEmail()
  @IsNotEmpty()
  nova_email: string;
}

export class AgreementEmployeeDto extends AgreementPersonDto {
  /** Informativos -- snapshot de multi_position/multi_department del empleado, no editables desde el form. */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  multi_position?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  multi_department?: string[];
}

export class CreateAgreementDto {
  @IsObject()
  @ValidateNested()
  @Type(() => AgreementEmployeeDto)
  employee: AgreementEmployeeDto;

  @IsObject()
  @ValidateNested()
  @Type(() => AgreementPersonDto)
  responsible: AgreementPersonDto;

  @IsDateString()
  @IsNotEmpty()
  start_date: string;

  @IsOptional()
  @IsDateString()
  end_date?: string;

  @IsString()
  @IsNotEmpty()
  reason: string;

  /** Quién crea el registro — opcional, se completa desde data_employee en el front */
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => AgreementPersonDto)
  created_by?: AgreementPersonDto;
}

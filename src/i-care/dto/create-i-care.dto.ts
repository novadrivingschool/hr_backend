import { 
  IsString, 
  IsNotEmpty, 
  IsOptional, 
  IsEmail, 
  IsArray, 
  IsDateString, 
  IsObject, 
  ValidateNested 
} from 'class-validator';
import { Type } from 'class-transformer';

// DTO para Responsible
export class ResponsibleDto {
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

// DTO para Person (submitter y staff_name)
export class PersonDto {
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

export class CreateICareDto {
  @IsString()
  @IsNotEmpty()
  urgency: string;

  @IsDateString()
  @IsNotEmpty()
  date: string;

  @IsObject()
  @ValidateNested()
  @Type(() => PersonDto)
  submitter: PersonDto;

  @IsObject()
  @ValidateNested()
  @Type(() => PersonDto)
  @IsOptional()
  staff_name?: PersonDto; // NUEVO: Staff's Name

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ResponsibleDto)
  responsible: ResponsibleDto[];

  @IsString()
  @IsNotEmpty()
  department: string;

  @IsString()
  @IsNotEmpty()
  staffType: string;

  @IsString()
  @IsNotEmpty()
  reason: string;

  @IsString()
  @IsNotEmpty()
  details: string;

  @IsOptional()
  @IsString()
  dnAccountLink?: string;

  @IsOptional()
  @IsString()
  accountPhone?: string;

  @IsOptional()
  @IsArray()
  attachments?: any[];
}
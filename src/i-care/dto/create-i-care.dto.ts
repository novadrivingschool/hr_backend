import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEmail,
  IsArray,
  IsDateString,
  IsObject,
  ValidateNested,
  IsBoolean,
  IsEnum,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ICareStatus, ICareUrgency } from '../entities/i-care.entity';

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

export class ResponsibleDto extends PersonDto {}

export class CreateICareDto {
  @IsEnum(ICareUrgency)
  @IsNotEmpty()
  urgency: ICareUrgency;

  @IsDateString()
  @IsNotEmpty()
  date: string;

  @IsObject()
  @ValidateNested()
  @Type(() => PersonDto)
  submitter: PersonDto;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => PersonDto)
  staff_name?: PersonDto;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ResponsibleDto)
  responsible?: ResponsibleDto[];

  @IsOptional()
  @IsString()
  department?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  staffType?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  multi_position?: string[];

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

  @IsOptional()
  @IsEnum(ICareStatus)
  status?: ICareStatus;

  @IsOptional()
  @IsBoolean()
  committed?: boolean;

  @IsOptional()
  @IsString()
  committed_date?: string;

  @IsOptional()
  @IsString()
  committed_time?: string;

  @IsOptional()
  @IsString()
  committed_notes?: string;

  @IsOptional()
  @IsBoolean()
  justified?: boolean;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => PersonDto)
  justified_approved_by?: PersonDto;

  @IsOptional()
  @IsString()
  justified_date?: string;

  @IsOptional()
  @IsString()
  justified_time?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  justified_comments?: string[];
}
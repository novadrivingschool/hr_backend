// dto/review-creation-i-care.dto.ts
import { Type } from 'class-transformer';
import {
  IsArray, IsIn, IsObject, IsOptional, IsString,
  MaxLength, ValidateNested,
} from 'class-validator';

class EmployeeRefDto {
  @IsString() name: string;
  @IsString() last_name: string;
  @IsString() employee_number: string;
  @IsString() nova_email: string;
}

// DTO para que HR / Management legitimen la CREACION de un iCare levantado
// por un coordinator sobre su propio personal (submitter esta dentro de
// responsible[] del staff reportado). Este paso NO toca urgency ni justifica
// nada, solo valida si la creacion procede o no.
//
// action = 'approve': status vuelve a PENDING (sin justified, sin urgency).
// El coordinator hace su propio Justify con el flujo normal ya existente.
//
// action = 'reject': el caso pasa directo a REJECTED. No regresa al coordinator.
//
// No confundir con ReviewRejectionICareDto: ese es un flujo aparte (coordinator
// rechaza un pending, HR/Mgmt revisa el rechazo y ahi si elige urgency si hace
// override).
export class ReviewCreationICareDto {
  @IsIn(['approve', 'reject'])
  action: 'approve' | 'reject';

  @IsObject()
  @ValidateNested()
  @Type(() => EmployeeRefDto)
  reviewed_by: EmployeeRefDto;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  attachments?: string[];
}

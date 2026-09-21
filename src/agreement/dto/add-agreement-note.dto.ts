import { IsString, IsNotEmpty, IsObject, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { AgreementPersonDto } from './create-agreement.dto';

export class AddAgreementNoteDto {
  @IsString()
  @IsNotEmpty()
  note: string;

  @IsObject()
  @ValidateNested()
  @Type(() => AgreementPersonDto)
  added_by: AgreementPersonDto;
}

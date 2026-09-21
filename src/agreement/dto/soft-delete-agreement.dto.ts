import { IsObject, IsOptional, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { AgreementPersonDto } from './create-agreement.dto';

/**
 * Body opcional de DELETE /agreements/:id -- quién archivó el registro.
 * Se completa desde `currentUser` en el front (mismo dato que created_by).
 */
export class SoftDeleteAgreementDto {
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => AgreementPersonDto)
  deleted_by?: AgreementPersonDto;
}

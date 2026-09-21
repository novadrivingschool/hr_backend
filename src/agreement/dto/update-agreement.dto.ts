import { PartialType } from '@nestjs/mapped-types';
import { IsArray, IsOptional, IsString } from 'class-validator';
import { CreateAgreementDto } from './create-agreement.dto';

export class UpdateAgreementDto extends PartialType(CreateAgreementDto) {
  /**
   * Reemplaza el array completo de attachments (keys de S3) — mismo patrón
   * que PATCH /i-care/:id con attachments: el front sube los archivos
   * nuevos a S3 primero (uploadFileToS3General) y luego manda aquí el
   * array final de keys (existentes + nuevas, ya sin las eliminadas).
   */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  attachments?: string[];
}

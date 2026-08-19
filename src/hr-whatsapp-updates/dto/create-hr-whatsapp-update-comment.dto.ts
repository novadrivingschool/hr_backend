import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ChangedByDto } from './create-hr-whatsapp-update.dto';

// Adjunto de UN comentario — objeto completo (no solo la key, a diferencia
// de HrWhatsappUpdate.attachments) porque el frontend ya lo tiene disponible
// apenas termina el upload (ver hr_whatsapp_files_crud.js) y así el
// comentario se puede mostrar sin un round-trip extra a buscar metadata.
// Mismo criterio que usa Novana para adjuntos de comentario.
export class HrWhatsappCommentAttachmentDto {
  @IsString()
  @MaxLength(512)
  key!: string;

  @IsString()
  @MaxLength(255)
  name!: string;

  @IsString()
  @MaxLength(120)
  mime_type!: string;

  @IsInt()
  @Min(0)
  size!: number;
}

export class CreateHrWhatsappUpdateCommentDto {
  // Opcional: un comentario puede ser solo un archivo. Se valida en el
  // service que venga texto, adjuntos, o ambos (no un comentario vacío).
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  body?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10, { message: 'Máximo 10 archivos por comentario' })
  @ValidateNested({ each: true })
  @Type(() => HrWhatsappCommentAttachmentDto)
  attachments?: HrWhatsappCommentAttachmentDto[];

  @IsOptional()
  @IsObject()
  created_by?: ChangedByDto;
}

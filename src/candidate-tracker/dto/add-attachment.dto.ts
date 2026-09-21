import { IsString, MaxLength } from 'class-validator';

/** Key devuelta por aws_services_backend tras subir el archivo. */
export class AddAttachmentDto {
  @IsString()
  @MaxLength(512)
  key!: string;
}

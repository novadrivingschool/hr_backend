import {
  IsString,
  IsNotEmpty,
  IsDateString,
  IsObject,
  ValidateNested,
  IsInt,
  Min,
  IsArray,
} from 'class-validator'
import { Type } from 'class-transformer'

class MetaDto {
  @IsInt() @Min(0)
  totalTareas: number

  @IsInt() @Min(0)
  tareasMarcadas: number
}

class SeccionDto {
  @IsString() @IsNotEmpty()
  title: string

  @IsArray()
  @IsString({ each: true })
  checked: string[] = []        // por si no llega, default array

  // Puede no venir en el payload, pero la normalizamos a null en el service
  notes?: string | null
}

export class CreateChecklistDto {
  @IsString() @IsNotEmpty()
  ubicacion: string

  @IsString() @IsNotEmpty()
  responsable: string

  @IsDateString()
  fecha: string

  @IsObject()
  secciones: Record<string, SeccionDto>

  @ValidateNested()
  @Type(() => MetaDto)
  _meta: MetaDto
}

import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsArray,
  IsIn,
  IsObject,
  Matches,
  ValidateNested,
  ArrayMinSize,
  ArrayMaxSize,
  IsBoolean,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PersonDto, ResponsibleDto } from './create-i-care.dto';

/**
 * 2026-09-23: SOLO PARA PRUEBAS (Postman). Ver ICareService.seedHistorical().
 * Permite crear iCares con fecha pasada (ej. 2024) directamente en `pending`
 * o `solved`, para probar la escalada de ofensas / records permanentes.
 * El offense NO se manda ni se valida aqui: en `solved` se calcula solo,
 * usando la fecha historica de justify como referencia.
 */
export const SEED_TARGET_STATUSES = ['pending', 'solved'] as const;
export type SeedTargetStatus = (typeof SEED_TARGET_STATUSES)[number];

export class SeedICareItemDto {
  @IsIn(SEED_TARGET_STATUSES as unknown as string[])
  target_status: SeedTargetStatus;

  /** Fecha del reporte (YYYY-MM-DD). Tambien se usa como createdAt. */
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'date must be YYYY-MM-DD' })
  date: string;

  @IsObject()
  @ValidateNested()
  @Type(() => PersonDto)
  submitter: PersonDto;

  @IsObject()
  @ValidateNested()
  @Type(() => PersonDto)
  staff_name: PersonDto;

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

  /** Debe existir en i_care_reason (urgency/offense_category salen de ahi, igual que create()). */
  @IsString()
  @IsNotEmpty()
  reason: string;

  @IsString()
  @IsNotEmpty()
  details: string;

  /** Solo `solved`: si la ofensa sale permanente, crea tambien la entrada en el
   *  logbook (seccion sanctions) con la fecha historica. Default false. */
  @IsOptional()
  @IsBoolean()
  create_logbook_entry?: boolean;
}

export class SeedICareDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => SeedICareItemDto)
  records: SeedICareItemDto[];
}

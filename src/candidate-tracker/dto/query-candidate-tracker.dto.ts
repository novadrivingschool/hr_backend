import { IsEnum, IsInt, IsOptional, IsString, Matches, Min } from 'class-validator';
import { Type } from 'class-transformer';
import {
  CandidateSourceEnum,
  CandidateStatusEnum,
  CandidateResultEnum,
  CandidateFinalResultEnum,
} from '../enums';

export class QueryCandidateTrackerDto {
  /** Busca por nombre, email, telefono o posicion (ILIKE). */
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsEnum(CandidateStatusEnum)
  status?: CandidateStatusEnum;

  @IsOptional()
  @IsEnum(CandidateResultEnum)
  result?: CandidateResultEnum;

  /** Resultado definitivo (seccion final del formulario, distinto de
   * `result`/entrevista de HR). */
  @IsOptional()
  @IsEnum(CandidateFinalResultEnum)
  finalResult?: CandidateFinalResultEnum;

  @IsOptional()
  @IsEnum(CandidateSourceEnum)
  source?: CandidateSourceEnum;

  @IsOptional()
  @IsString()
  recruiter?: string;

  @IsOptional()
  @IsString()
  department?: string;

  /** Filtra por candidate_trackers.createdAt (YYYY-MM-DD, inclusive). Sin
   * dateTo, se toma hasta hoy; sin dateFrom, desde el primer registro. */
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'dateFrom debe tener el formato YYYY-MM-DD' })
  dateFrom?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'dateTo debe tener el formato YYYY-MM-DD' })
  dateTo?: string;

  /** Filtra por candidate_trackers.interviewCompletedAt (YYYY-MM-DD,
   * inclusive) -- para responder "de que fecha a que fecha entreviste",
   * a diferencia de dateFrom/dateTo que es sobre cuando se registro el
   * candidato (createdAt). */
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'interviewDateFrom debe tener el formato YYYY-MM-DD' })
  interviewDateFrom?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'interviewDateTo debe tener el formato YYYY-MM-DD' })
  interviewDateTo?: string;

  /** Filtra por CUANDO el status/result cambio a ese valor (usa
   * candidate_tracker_status_history), no por el status/result actual --
   * si se manda junto con `status`/`result`, reemplaza el filtro de valor
   * actual por "en algun momento de este rango paso a valer esto". Sin
   * `status`/`result`, filtra por cualquier cambio de ese campo en el
   * rango, sin importar a que valor. */
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'statusDateFrom debe tener el formato YYYY-MM-DD' })
  statusDateFrom?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'statusDateTo debe tener el formato YYYY-MM-DD' })
  statusDateTo?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'resultDateFrom debe tener el formato YYYY-MM-DD' })
  resultDateFrom?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'resultDateTo debe tener el formato YYYY-MM-DD' })
  resultDateTo?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 25;
}

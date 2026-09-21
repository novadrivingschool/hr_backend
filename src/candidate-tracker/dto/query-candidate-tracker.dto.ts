import { IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';
import {
  CandidateSourceEnum,
  CandidateStatusEnum,
  CandidateResultEnum,
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

  @IsOptional()
  @IsEnum(CandidateSourceEnum)
  source?: CandidateSourceEnum;

  @IsOptional()
  @IsString()
  recruiter?: string;

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

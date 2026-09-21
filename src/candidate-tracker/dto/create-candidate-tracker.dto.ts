import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';
import {
  CandidateSourceEnum,
  CandidateStatusEnum,
  CandidateResultEnum,
  EnglishInterviewResultEnum,
  InterviewTypeEnum,
  EmploymentTypeEnum,
} from '../enums';

export class CreateCandidateTrackerDto {
  @IsString()
  @Length(1, 160)
  candidateName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  position?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  recruiter?: string | null;

  @IsOptional()
  @IsEnum(CandidateSourceEnum)
  source?: CandidateSourceEnum | null;

  /** Texto libre (sin catalogo fijo). Se normaliza con "+" al frente en el
   * service antes de guardar, sin importar si el cliente ya lo mando o no;
   * aqui solo se valida la forma (opcional "+", 1 a 3 digitos -- el estandar
   * E.164 no define codigos de pais de mas de 3 digitos -- o vacio). */
  @IsOptional()
  @IsString()
  @MaxLength(4)
  @Matches(/^$|^\+?\d{1,3}$/, {
    message: 'phoneCountryCode debe ser solo digitos (maximo 3, con "+" opcional al frente), ej. +52',
  })
  phoneCountryCode?: string | null;

  /** Formato exacto (xxx) xxx-xxxx (10 digitos reales), aplicado en el
   * frontend; se revalida aqui para que una llamada directa a la API no
   * pueda saltarse la mascara. */
  @IsOptional()
  @IsString()
  @MaxLength(14)
  @Matches(/^$|^\(\d{3}\) \d{3}-\d{4}$/, {
    message: 'phoneNumber debe tener el formato (xxx) xxx-xxxx',
  })
  phoneNumber?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  email?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  countryAddress?: string | null;

  @IsOptional()
  @IsBoolean()
  driversLicense?: boolean;

  @IsOptional()
  @IsBoolean()
  englishTestPassed?: boolean;

  @IsOptional()
  @IsBoolean()
  personalityTestPassed?: boolean;

  @IsOptional()
  @IsBoolean()
  typingTestPassed?: boolean;

  @IsOptional()
  @IsEnum(EnglishInterviewResultEnum)
  englishInterview?: EnglishInterviewResultEnum | null;

  @IsOptional()
  @IsEnum(InterviewTypeEnum)
  interviewType?: InterviewTypeEnum | null;

  @IsOptional()
  @IsEnum(EmploymentTypeEnum)
  employmentType?: EmploymentTypeEnum | null;

  @IsOptional()
  @IsString()
  interviewFeedback?: string | null;

  @IsOptional()
  @IsEnum(CandidateStatusEnum)
  status?: CandidateStatusEnum;

  @IsOptional()
  @IsEnum(CandidateResultEnum)
  result?: CandidateResultEnum | null;

  @IsOptional()
  @IsString()
  observations?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  createdByEmployeeNumber?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  createdByName?: string | null;
}

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
  CandidateFinalResultEnum,
  EnglishInterviewResultEnum,
  InterviewTypeEnum,
  EmploymentTypeEnum,
  ContactAttemptEnum,
} from '../enums';

export class CreateCandidateTrackerDto {
  @IsString()
  @Length(1, 160)
  candidateName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  position?: string | null;

  /** Catalogo `locations` (locations_service) -- ver comentario de
   * `location` en candidate-tracker.entity.ts. */
  @IsOptional()
  @IsString()
  @MaxLength(160)
  location?: string | null;

  /** Catalogo `type_of_staffs` (hr_backend) -- ver comentario de
   * `typeOfStaff` en candidate-tracker.entity.ts. */
  @IsOptional()
  @IsString()
  @MaxLength(160)
  typeOfStaff?: string | null;

  /** Nombre del departamento (catalogo `departments`); texto libre, no un id. */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  department?: string | null;

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
  @IsEnum(ContactAttemptEnum)
  contactAttempt?: ContactAttemptEnum | null;

  @IsOptional()
  @IsString()
  contactAttemptNotes?: string | null;

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
  @IsBoolean()
  ageVerified?: boolean;

  @IsOptional()
  @IsBoolean()
  diplomaTranscript?: boolean;

  @IsOptional()
  @IsBoolean()
  twentyOnePlus?: boolean;

  @IsOptional()
  @IsBoolean()
  backgroundCheckPassed?: boolean;

  @IsOptional()
  @IsBoolean()
  psychometricTestPassed?: boolean;

  @IsOptional()
  @IsBoolean()
  noAtFaultAccident?: boolean;

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

  /** Formato YYYY-MM-DD (v-date-picker en el frontend) o vacio para
   * limpiar el campo -- se normaliza a Date/null en el service. */
  @IsOptional()
  @IsString()
  @Matches(/^$|^\d{4}-\d{2}-\d{2}$/, {
    message: 'interviewScheduledAt debe tener el formato YYYY-MM-DD',
  })
  interviewScheduledAt?: string | null;

  @IsOptional()
  @IsString()
  @Matches(/^$|^\d{4}-\d{2}-\d{2}$/, {
    message: 'interviewCompletedAt debe tener el formato YYYY-MM-DD',
  })
  interviewCompletedAt?: string | null;

  @IsOptional()
  @IsEnum(CandidateStatusEnum)
  status?: CandidateStatusEnum;

  @IsOptional()
  @IsEnum(CandidateResultEnum)
  result?: CandidateResultEnum | null;

  /** Seccion "In-Person Interview" -- opcional, no mandatory. */
  @IsOptional()
  @IsEnum(CandidateResultEnum)
  inPersonInterviewResult?: CandidateResultEnum | null;

  @IsOptional()
  @IsString()
  inPersonInterviewNotes?: string | null;

  /** Resultado definitivo del proceso, seccion final. */
  @IsOptional()
  @IsEnum(CandidateFinalResultEnum)
  finalResult?: CandidateFinalResultEnum | null;

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

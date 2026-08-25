import { IsBoolean, IsDateString, IsNumber, IsObject, IsOptional, IsString, Length, Max, Min } from 'class-validator';

export class PerformedByDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  last_name?: string;

  @IsOptional()
  @IsString()
  employee_number?: string;
}

export class CreateHolidayDto {
  @IsString()
  @Length(2, 150)
  name: string;

  @IsDateString()
  date: string;

  // Horas autorizadas a pagar cuando el empleado no tiene schedule ese día
  // (ej. 8 u 4). Obligatorio: no hay default, HR debe decidirlo explícitamente
  // en cada holiday. Ver payroll.service.ts -> buildHolidayFallbackScheduleDetails.
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(24)
  authorized_hours: number;

  @IsOptional()
  @IsString()
  @Length(2, 50)
  type?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;

  // Indica si las horas autorizadas de este holiday son de toma obligatoria
  // para el empleado. Opcional: default false a nivel de servicio/DB si no
  // se envía.
  @IsOptional()
  @IsBoolean()
  is_mandatory?: boolean;

  @IsOptional()
  @IsObject()
  performed_by?: PerformedByDto;
}
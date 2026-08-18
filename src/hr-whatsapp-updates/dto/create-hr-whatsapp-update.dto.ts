import { IsArray, IsDateString, IsIn, IsNotEmpty, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';
import {
  HR_WHATSAPP_ASIGNACION_OPTIONS,
  HR_WHATSAPP_STATUS_OPTIONS,
} from '../constants/hr-whatsapp-update.constants';

// Quién realiza la acción (create o cambio de status) — mismo esquema que
// PerformedByDto en holidays/dto/create-holiday.dto.ts. El frontend lo arma
// a partir del empleado logueado (Vuex 'auth' / localStorage 'data_employee').
// Se usa solo para poblar hr_whatsapp_update_status_history.changed_by_*;
// nunca es obligatorio para no bloquear el guardado si por algún motivo no
// está disponible.
export class ChangedByDto {
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

export class CreateHrWhatsappUpdateDto {
  @IsDateString({}, { message: 'entry_date debe ser una fecha válida (YYYY-MM-DD)' })
  @IsNotEmpty()
  entry_date: string;

  // ── "Name" (columna original del Excel) ────────────────────────────
  // Debe venir UNO de los dos grupos: (reported_employee_number +
  // reported_name [+ reported_last_name]) cuando es un empleado real, o
  // reported_other cuando no lo es (ej. "CS chat"). Se valida en el
  // service — acá solo se validan tipos/longitudes.
  @IsString()
  @IsOptional()
  @MaxLength(50)
  reported_employee_number?: string;

  @IsString()
  @IsOptional()
  @MaxLength(255)
  reported_name?: string;

  @IsString()
  @IsOptional()
  @MaxLength(255)
  reported_last_name?: string;

  @IsString()
  @IsOptional()
  @MaxLength(255)
  reported_other?: string;

  @IsString()
  @IsNotEmpty()
  question: string;

  // ── "Responsable" (mismo esquema, pero el grupo completo es opcional) ──
  @IsString()
  @IsOptional()
  @MaxLength(50)
  responsable_employee_number?: string;

  @IsString()
  @IsOptional()
  @MaxLength(255)
  responsable_name?: string;

  @IsString()
  @IsOptional()
  @MaxLength(255)
  responsable_last_name?: string;

  @IsString()
  @IsOptional()
  @MaxLength(255)
  responsable_other?: string;

  @IsIn(HR_WHATSAPP_ASIGNACION_OPTIONS, {
    message: `asignacion debe ser una de: ${HR_WHATSAPP_ASIGNACION_OPTIONS.join(', ')}`,
  })
  @IsNotEmpty()
  asignacion: string;

  @IsIn(HR_WHATSAPP_STATUS_OPTIONS, {
    message: `status debe ser uno de: ${HR_WHATSAPP_STATUS_OPTIONS.join(', ')}`,
  })
  @IsOptional()
  status?: string;

  @IsString()
  @IsOptional()
  observations?: string;

  @IsString()
  @IsOptional()
  seguimiento?: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  asana_link?: string;

  // Keys de S3 (no bytes ni URLs) — ver hr-whatsapp-update.entity.ts. El
  // frontend sube el archivo directo a aws_services_backend y solo manda acá
  // el string resultante.
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  attachments?: string[];

  @IsOptional()
  @IsObject()
  changed_by?: ChangedByDto;
}

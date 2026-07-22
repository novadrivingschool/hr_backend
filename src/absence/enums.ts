// src/absence/enums.ts
import { OUTAGE_REASONS, OutageReason } from 'src/schedule_event/entities/register.enum';

/**
 * Los tipos de Absence son exactamente las razones de Outage del master schedule.
 * Se reexportan desde register.enum para que exista una sola fuente de verdad:
 * si mañana se agrega una razón allá, este módulo la hereda sin tocar nada.
 */
export { OUTAGE_REASONS, OutageReason };

export const ABSENCE_REASONS = OUTAGE_REASONS;
export type AbsenceReason = OutageReason;

/**
 * Razones que permiten registrar la absence sin hora de fin (outage abierto).
 * Espeja OUTAGE_END_OPTIONAL_REASONS de employee_schedule/dto.
 */
export const ABSENCE_END_OPTIONAL_REASONS: readonly AbsenceReason[] = [
  'No Internet',
  'Power Outage',
];

export enum AbsenceTimeTypeEnum {
  Days = 'Days',
  Hours = 'Hours',
}

/**
 * No hay flujo de aprobación: la absence nace registrada.
 * Solo puede cancelarse.
 */
export enum AbsenceStatusEnum {
  Registered = 'Registered',
  Cancelled = 'Cancelled',
}

/**
 * Estado de la escritura en el master schedule.
 * El evento se guarda después de los correos y dentro de try/catch, así que
 * puede fallar sin tumbar la request. Este campo deja el fallo visible y
 * reintentable en vez de enterrarlo en un logger.warn.
 */
export enum EventSyncStatusEnum {
  Pending = 'Pending',
  Synced = 'Synced',
  Failed = 'Failed',
}

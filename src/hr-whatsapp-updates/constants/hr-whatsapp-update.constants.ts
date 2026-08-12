// src/hr-whatsapp-updates/constants/hr-whatsapp-update.constants.ts
//
// Listas cerradas extraídas de las validaciones de datos (dropdowns) de la
// hoja "HR Whatsapp Updates" (Google Sheets / Excel) que el equipo de HR usa
// para llevar el seguimiento diario de mensajes de WhatsApp.
//
// Si el equipo agrega/quita una opción en la hoja de origen, este es el
// único lugar que hay que tocar en el backend (el frontend replica esta
// misma lista en whatsapp_updates_constants.js).

export const HR_WHATSAPP_ASIGNACION_OPTIONS = [
  'Solicitud HR',
  'Recruitment',
  'Payroll Request',
  'Pagos Efectivo',
  'Request Interdepartamental',
  'Paperwork & Training',
  'Solicitud Facturas',
] as const;

export const HR_WHATSAPP_STATUS_OPTIONS = [
  'OK',
  'In Progress',
  'Waiting response',
  'Not Answered',
  'Not Resolved',
] as const;

export const HR_WHATSAPP_DEFAULT_STATUS: HrWhatsappStatus = 'In Progress';

export type HrWhatsappAsignacion = (typeof HR_WHATSAPP_ASIGNACION_OPTIONS)[number];
export type HrWhatsappStatus = (typeof HR_WHATSAPP_STATUS_OPTIONS)[number];

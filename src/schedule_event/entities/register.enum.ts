/* src\schedule_event\entities\register.enum.ts */
export enum RegisterEnum {
  WORK_SHIFT = 'Work Shift',
  TIME_OFF_REQUEST = 'Time Off Request',
  TIME_OFF_RECOVERY = 'Time Off Recovery',
  EXTRA_HOURS = 'Extra Hours',
  LUNCH = 'Lunch',
  OFF = 'Off',
  OUTAGE = 'Outage',
}

export const OUTAGE_REASONS = [
  'No Internet',
  'Power Outage',
  'Last Minute Cancellation',
  'Illness',
] as const;

export type OutageReason = typeof OUTAGE_REASONS[number];
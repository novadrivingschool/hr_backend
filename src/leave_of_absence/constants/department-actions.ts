// constants/department-actions.ts
import { LoaDepartmentEnum } from '../enums';

/** Etiqueta legible por depto — usada en subjects, templates y bitácora. */
export const LOA_DEPARTMENT_LABELS: Record<LoaDepartmentEnum, string> = {
    [LoaDepartmentEnum.It]: 'IT',
    [LoaDepartmentEnum.Sales]: 'Sales',
    [LoaDepartmentEnum.Education]: 'Education',
    [LoaDepartmentEnum.Calendar]: 'Calendar',
    [LoaDepartmentEnum.Fleet]: 'Fleet',
};

/**
 * Qué debe hacer cada depto al CREARSE un LOA (fase de desactivación) y al
 * marcarse RETURNED TO WORK (fase de reactivación) — contenido de
 * ACTION_ITEMS en los correos de loa_created_department / loa_returned_to_work.
 * Puramente informativo para el destinatario; no dispara nada en el sistema.
 */
export const LOA_DEPARTMENT_DISABLE_ACTIONS: Record<LoaDepartmentEnum, string[]> = {
    [LoaDepartmentEnum.It]: [
        'Disable system/network access for the duration of the leave.',
        'Revoke device credentials and pause email forwarding if applicable.',
    ],
    [LoaDepartmentEnum.Sales]: [
        'Reassign active leads and deals to another team member.',
        'Pause commission tracking for this employee.',
    ],
    [LoaDepartmentEnum.Education]: [
        'Reassign or pause any courses/students currently under this employee.',
    ],
    [LoaDepartmentEnum.Calendar]: [
        "Block or clear this employee's scheduling slots for the leave period.",
    ],
    [LoaDepartmentEnum.Fleet]: [
        'Reassign or release any vehicle currently checked out to this employee.',
    ],
};

export const LOA_DEPARTMENT_ENABLE_ACTIONS: Record<LoaDepartmentEnum, string[]> = {
    [LoaDepartmentEnum.It]: [
        'Restore system/network access and device credentials.',
    ],
    [LoaDepartmentEnum.Sales]: [
        'Reassign leads/deals back to this employee if applicable.',
        'Resume commission tracking.',
    ],
    [LoaDepartmentEnum.Education]: [
        'Resume courses/students previously reassigned or paused.',
    ],
    [LoaDepartmentEnum.Calendar]: [
        "Reopen this employee's scheduling slots.",
    ],
    [LoaDepartmentEnum.Fleet]: [
        'Reassign a vehicle back to this employee if needed.',
    ],
};

/** Genérico — usado en el correo de returned_to_work que va a HR/submitter (no a un depto específico). */
export const LOA_GENERIC_ENABLE_NOTICE = ['All departments have been notified to restore whatever applies to them.'];

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
 * Contenido de los correos de creación (loa_created_department) — describe en
 * términos GENÉRICOS qué debe atender cada depto al desactivar accesos.
 * INDEPENDIENTE de las subtareas reales: las subtareas las registra cada
 * depto libremente por caso (ver LeaveOfAbsenceService.createSubtask) y no
 * existen todavía al momento de crear el LOA, así que no hay de dónde
 * derivar este texto dinámicamente.
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

/**
 * Correo único combinado de returned_to_work (a los 5 deptos + loa-hr + actor)
 * — ya no hay checklist de reactivación por depto, es solo un aviso de que la
 * bitácora de ese depto queda bloqueada para este LOA.
 */
export const LOA_RETURN_TO_WORK_NOTICE = [
    'The employee has returned to work. This department\'s bitácora for this LOA is now locked — no further entries can be added.',
];

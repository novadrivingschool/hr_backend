// constants/department-actions.ts
import { LoaDepartmentEnum } from '../enums';

/** Etiqueta legible por depto — usada en subjects, templates y bitácora. */
export const LOA_DEPARTMENT_LABELS: Record<LoaDepartmentEnum, string> = {
    [LoaDepartmentEnum.It]: 'IT',
    [LoaDepartmentEnum.Sales]: 'Sales',
    [LoaDepartmentEnum.Education]: 'Education',
    [LoaDepartmentEnum.Calendar]: 'Calendar',
    [LoaDepartmentEnum.Fleet]: 'Fleet',
    [LoaDepartmentEnum.Accounting]: 'Accounting',
};

/**
 * Roles que atienden Education desde el split loa-education-teacher /
 * loa-education-instructor (reemplaza el rol único 'loa-education', que ya
 * no existe). No se modeló como parte de LoaDepartmentEnum porque Education
 * sigue siendo UN solo depto/bitácora (una sola key en department_logs) —
 * lo que cambia es el ROL que la atiende, no el depto en sí.
 */
export const LOA_EDUCATION_TEACHER_ROLE = 'loa-education-teacher';
export const LOA_EDUCATION_INSTRUCTOR_ROLE = 'loa-education-instructor';

/**
 * Decide qué rol de Education le corresponde a ESTE LOA según el
 * multi_type_of_job del empleado (snapshot en employee_data — ver
 * LoaEmployeeSnapshot). Match por substring case-insensitive, no por
 * catálogo cerrado: multi_type_of_job es un CRUD libre en Employees
 * (type_of_job), no un enum fijo, así que no hay lista exhaustiva contra la
 * que matchear exacto.
 *   - Si algún valor contiene "teacher" (ej. "CR Teacher") → SOLO teacher.
 *     "Teacher" gana aunque el empleado también tenga un valor con
 *     "instructor" (ej. "BTW Instructor & CR" + "CR Teacher" → solo
 *     loa-education-teacher recibe el correo — caso confirmado por HR).
 *   - Si no hay "teacher" pero algún valor contiene "instructor" (ej. "BTW
 *     Instructor & CR") → SOLO loa-education-instructor.
 *   - Si no matchea ninguno (el empleado no tiene type_of_job relacionado a
 *     educación — ej. un Sales rep de LOA) → devuelve AMBOS roles como
 *     fallback seguro, para no dejar la bitácora de Education de este LOA
 *     sin nadie notificado ni con acceso de escritura.
 */
export function resolveEducationRoles(multiTypeOfJob: string[] | undefined | null): string[] {
    const values = (multiTypeOfJob || []).map((v) => (v || '').toLowerCase());
    if (values.some((v) => v.includes('teacher'))) return [LOA_EDUCATION_TEACHER_ROLE];
    if (values.some((v) => v.includes('instructor'))) return [LOA_EDUCATION_INSTRUCTOR_ROLE];
    return [LOA_EDUCATION_TEACHER_ROLE, LOA_EDUCATION_INSTRUCTOR_ROLE];
}

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
    [LoaDepartmentEnum.Accounting]: [
        'Pause payroll runs and reimbursement/expense processing for this employee during the leave.',
        'Flag any pending invoices, deposits or petty cash tied to this employee.',
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

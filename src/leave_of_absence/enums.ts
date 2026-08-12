// src/leave_of_absence/enums.ts

/**
 * Tipo de Leave of Absence. Solo dos valores por ahora — si HR agrega más
 * (ej. maternity, bereavement) se extiende aquí sin tocar entity ni dto.
 */
export enum LoaTypeEnum {
    Medical = 'medical_leave',
    Personal = 'personal_leave',
}

/**
 * Departamentos que atienden un LOA — cada uno mapea 1:1 al rol `loa-<dept>`
 * (ver EmployeesCard.vue). No confundir con `loa-hr`, que es el rol que
 * gestiona el registro completo, no una bitácora de departamento.
 */
export enum LoaDepartmentEnum {
    It = 'it',
    Sales = 'sales',
    Education = 'education',
    Calendar = 'calendar',
    Fleet = 'fleet',
}

export const LOA_DEPARTMENTS: readonly LoaDepartmentEnum[] = [
    LoaDepartmentEnum.It,
    LoaDepartmentEnum.Sales,
    LoaDepartmentEnum.Education,
    LoaDepartmentEnum.Calendar,
    LoaDepartmentEnum.Fleet,
];

/**
 * Un LOA tiene dos rondas de atención por departamento: desactivar accesos
 * mientras el empleado está de baja, y reactivarlos cuando HR confirma que
 * regresó. `phase` en cada entry de la bitácora dice a cuál ronda pertenece.
 */
export enum LoaLogPhaseEnum {
    Deactivation = 'deactivation',
    Reactivation = 'reactivation',
}

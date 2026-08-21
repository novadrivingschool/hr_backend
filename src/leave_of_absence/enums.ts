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
 * (ver EmployeesCard.vue), CON UNA EXCEPCIÓN: Education ya no tiene un rol
 * único — se resolvió en loa-education-teacher / loa-education-instructor
 * según el multi_type_of_job del empleado (ver resolveEducationRoles en
 * ./constants/department-actions.ts). No confundir con `loa-hr`, que es el
 * rol que gestiona el registro completo, no una bitácora de departamento.
 */
export enum LoaDepartmentEnum {
    It = 'it',
    Sales = 'sales',
    Education = 'education',
    Calendar = 'calendar',
    Fleet = 'fleet',
    Accounting = 'accounting',
}

export const LOA_DEPARTMENTS: readonly LoaDepartmentEnum[] = [
    LoaDepartmentEnum.It,
    LoaDepartmentEnum.Sales,
    LoaDepartmentEnum.Education,
    LoaDepartmentEnum.Calendar,
    LoaDepartmentEnum.Fleet,
    LoaDepartmentEnum.Accounting,
];

/**
 * Legacy — el modelo de dos rondas (deactivation/reactivation) ya no existe.
 * Se conserva solo para tipar `phase` en entries viejas de `LoaDepartmentLogEntry`
 * (dato histórico congelado, no se generan entries nuevas con este campo).
 */
export enum LoaLogPhaseEnum {
    Deactivation = 'deactivation',
}

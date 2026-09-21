/**
 * 2026-09-19: valores confirmados por el usuario -- Class B/C/D (NO existe
 * Class A en este catalogo). Debe mantenerse en sync manualmente con
 * `offenseCategoryOptions` en
 * nova-one-frontend/src/components/Hr/ICare/ICareReasons.vue (no hay
 * codegen compartido entre back y front en este proyecto).
 *
 * Igual que ICareUrgency (i-care/entities/i-care.entity.ts): la columna en
 * i_care_reason es varchar, no enum nativo de Postgres -- se valida a nivel
 * de aplicacion (CreateICareReasonDto -> @IsEnum(ICareOffenseCategory)).
 */
export enum ICareOffenseCategory {
    CLASS_B_SERIOUS = 'Class B Serious Offense',
    CLASS_C_MODERATE = 'Class C Moderate Offense',
    CLASS_D_LIGHT = 'Class D Light Offense',
}

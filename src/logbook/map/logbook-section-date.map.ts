/**
 * Maps each section to the field name that represents its main date.
 * If null, the section has no applicable date for filtering.
 */
export const sectionDateMap: Record<string, string | null> = {
  training: 'date',
  performance: 'evaluation_date',
  accidents: 'accident_date',
  incidents: 'incident_date',
  permissions: 'permission_date',
  recognitions: 'recognition_date',
  sanctions: 'sanction_date',
  immigration: 'expiration_date',

  // Secciones sin fecha
  absences: null,
  documents: null,
  other: null
};

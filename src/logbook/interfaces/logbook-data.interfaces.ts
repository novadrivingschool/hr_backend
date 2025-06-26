// Training
export interface TrainingData {
  description: string;
  date: string;
  certificate: string;
  evaluation: string;
}

// Performance
export interface PerformanceData {
  evaluation_date: string;
  comments: string;
  goals: string;
}

// Accidents
export interface AccidentsData {
  accident_date: string;
  accident_description: string;
  injury: string;
  medical_attention: string;
  report_file: string;
}

// Incidents
export interface IncidentsData {
  incident_date: string;
  incident_type: string;
  retraining: string;
  trainer: string;
  retraining_date: string;
  sick_days: string;
}

// Permissions
export interface PermissionsData {
  permission_type: string;
  permission_date: string;
  notes: string;
}

// Absences
export interface AbsencesData {
  medical_leave: string;
  unjustified_dates: string;
}

// Recognitions
export interface RecognitionsData {
  awards: string;
  reason: string;
  recognition_date: string;
}

// Sanctions
export interface SanctionsData {
  warning_type: string;
  disciplinary_action: string;
  sanction_date: string;
}

// Documents
export interface DocumentsData {
  contract: string;
  manual: string;
  benefits_forms: string;
  equipment: string;
}

// Immigration
export interface ImmigrationData {
  visa_status: string;
  documents: string;
  expiration_date: string;
}

// Other
export interface OtherData {
  hr_comments: string;
  availability_notes: string;
}

// Union global
export type LogbookDataBySection =
  | { section: 'training'; data: TrainingData }
  | { section: 'performance'; data: PerformanceData }
  | { section: 'accidents'; data: AccidentsData }
  | { section: 'incidents'; data: IncidentsData }
  | { section: 'permissions'; data: PermissionsData }
  | { section: 'absences'; data: AbsencesData }
  | { section: 'recognitions'; data: RecognitionsData }
  | { section: 'sanctions'; data: SanctionsData }
  | { section: 'documents'; data: DocumentsData }
  | { section: 'immigration'; data: ImmigrationData }
  | { section: 'other'; data: OtherData };

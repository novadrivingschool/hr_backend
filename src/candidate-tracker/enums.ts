/* src/candidate-tracker/enums.ts
 *
 * Opciones fijas del modulo Candidate Tracker, migradas 1:1 desde las listas
 * (data validation) del Excel "Template_HR Candidate Tracker.xlsx" que HR
 * usaba antes de este modulo. Mismo patron que activity_request/enums.ts:
 * un enum de Postgres por campo, en vez de una tabla catalogo aparte.
 *
 * Si HR necesita agregar/quitar una opcion, hace falta una migracion nueva
 * (ALTER TYPE ... ADD VALUE) — no es editable desde la UI. Se eligio asi a
 * proposito: son listas chicas y estables (igual que Interview Type o
 * Employment Type en otros modulos), no catalogos que cambien seguido.
 */

export enum CandidateSourceEnum {
  Indeed = 'Indeed',
  CareerSite = 'Career Site',
  Referral = 'Referral',
  PartnerList = 'Partner List',
  CareerFair = 'Career Fair',
  IllinoisJobLink = 'Illinois JobLink',
  JobFair = 'Job Fair',
  University = 'University',
  LinkedIn = 'LinkedIn',
}

export enum EnglishInterviewResultEnum {
  Passed = 'Passed',
  Failed = 'Failed',
  Pending = 'Pending',
  NotEvaluated = 'Not Evaluated',
}

export enum InterviewTypeEnum {
  HrInterview = 'HR Interview',
  ManagementInterview = 'Management Interview',
}

export enum EmploymentTypeEnum {
  FullTime = 'Full-Time',
  PartTime = 'Part-Time',
  Internship = 'Internship',
}

export enum CandidateStatusEnum {
  ToContact = 'To Contact',
  AwaitingSecondInterview = 'Awaiting 2nd Interview',
  PassedBothInterviews = 'Passed Both Interview',
  NextStepsEmailSent = 'Next Steps Email Sent',
  Onboarding = 'Onboarding',
  Training = 'Training',
  AwaitingPaperwork = 'Awaiting Paperwork',
  NoResponse = 'Not Response',
}

export enum CandidateResultEnum {
  Hired = 'Hired',
  NoResponse = 'No Response',
  NotInterested = 'Not Interested',
  InProcess = 'In Process',
  Pending = 'Pending',
  ReadyForTraining = 'Ready for Training',
  FailTheTraining = 'Fail the Training',
  RejectJobOffer = 'Reject Job Offer',
  NoShow = 'No Show',
}

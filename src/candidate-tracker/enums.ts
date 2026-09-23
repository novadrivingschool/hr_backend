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

/*
 * LocationEnum y TypeOfStaffEnum (sucursal/ubicacion y categoria funcional
 * del puesto, campos pedidos por Javier (IT) 2026-09-21) vivieron aca como
 * enums fijos de Postgres con valores INVENTADOS -- no habia catalogo
 * confirmado en ese momento. Eliminados en la migracion
 * 1791000000000-ConvertCandidateTrackerLocationAndTypeOfStaffToVarchar
 * (2026-09-22, Javier confirmo que si existen catalogos reales: `locations`
 * en locations_service y `type_of_staffs` en hr_backend). `location` y
 * `typeOfStaff` en CandidateTracker son ahora texto libre (varchar), mismo
 * criterio que `department` -- ver comentarios en
 * candidate-tracker.entity.ts.
 */

/**
 * Seguimiento de intentos de contacto con el candidato -- seccion nueva en
 * el formulario (arriba de Screening), pedida por Javier (IT) 2026-09-21.
 * Reemplaza el registro manual que HR llevaba en observaciones sueltas
 * mientras intentaba comunicarse antes de llegar a Screening/Interview.
 */
export enum ContactAttemptEnum {
  PendingContact = 'Pending Contact',
  CallNoAnswer = 'Call - No Answer',
  MessageSent = 'Message Sent',
  CallAndMessageSent = 'Call & Message Sent',
  Contacted = 'Contacted',
  FollowUpNeeded = 'Follow-up Needed',
  NoResponse = 'No Response',
  NotInterested = 'Not Interested',
  InvalidContactInfo = 'Invalid Contact Info',
  Disqualified = 'Disqualified',
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

  // Agregados 2026-09-22 (Javier) -- pipeline alternativo/mas granular de
  // entrevistas, coexiste con los valores de arriba, no los reemplaza.
  ForHrInterview = 'For HR Interview',
  PassedHrInterviewPendingDocs = 'Passed HR Interview- Pending Docs',
  ForInPersonInterview = 'For In-Person Interview',
  FailedInPersonInterview = 'Failed In-Person Interview',
  PendingPaperworkForSos = 'Pending Paperwork for SOS',
  WithdrewApplication = 'Withdrew Application',

  // Movidos desde CandidateResultEnum 2026-09-22 (Javier): Result queda solo
  // con Passed/Failed (resultado de la entrevista) y todo lo que describe
  // en que etapa/desenlace esta el candidato vive en Status. Ver migracion
  // 1790800000000-MoveResultValuesToCandidateTrackerStatus.ts.
  Hired = 'Hired',
  NoResponseFromCandidate = 'No Response',
  NotInterested = 'Not Interested',
  InProcess = 'In Process',
  Pending = 'Pending',
  ReadyForTraining = 'Ready for Training',
  FailTheTraining = 'Fail the Training',
  RejectJobOffer = 'Reject Job Offer',
  Reject = 'Reject',
  NoShow = 'No Show',
  NotOkWithPay = 'Not Ok with Pay',
  FoundAnotherOpportunity = 'Found another opportunity',
  Ready = 'Ready',
  PendingDocs = 'Pending Docs',
  AcceptedOffer = 'Accepted Offer',
  RejectedOffer = 'Rejected Offer',
  RejectedByHr = 'Rejected by HR',
}

/**
 * Resultado de la entrevista. Reducido a Passed/Failed el 2026-09-22
 * (Javier): los otros 17 valores que tenia (Hired, No Response, In Process,
 * Pending, ...) pasaron a CandidateStatusEnum -- ver migracion
 * 1790800000000-MoveResultValuesToCandidateTrackerStatus.ts.
 */
export enum CandidateResultEnum {
  Passed = 'Passed',
  Failed = 'Failed',
}

/**
 * Resultado definitivo del proceso completo ("result final final"), pedido
 * por Javier (IT) 2026-09-22 -- va en una seccion propia AL FINAL del
 * formulario, despues de In-Person Interview. Es un campo DISTINTO de:
 *  - `result` (arriba): resultado de la entrevista de HR, solo Passed/Failed.
 *  - `inPersonInterviewResult` (ver entity): resultado de la entrevista
 *    presencial, tambien Passed/Failed, seccion propia.
 *  - `status` (CandidateStatusEnum): etapa/pipeline interno del candidato.
 *
 * OJO: 9 de estos 11 valores (todos menos Passed/Failed) son literalmente
 * los mismos que se movieron A `status` en la migracion
 * 1790800000000-MoveResultValuesToCandidateTrackerStatus.ts (mismo dia).
 * Se deja asi porque Javier lo pidio explicitamente como campo nuevo y
 * separado -- implica que un candidato puede terminar con, por ejemplo,
 * status = 'Rejected by HR' Y finalResult = 'Rejected by HR' al mismo
 * tiempo (mismo dato en dos columnas). Si mas adelante se decide que
 * `status` deje de usarse para el desenlace final, hace falta otra
 * migracion para retirar esos valores de CandidateStatusEnum.
 */
export enum CandidateFinalResultEnum {
  NoResponse = 'No Response',
  NotOkWithPay = 'Not Ok with Pay',
  FoundAnotherOpportunity = 'Found another opportunity',
  NotInterested = 'Not Interested',
  Ready = 'Ready',
  Passed = 'Passed',
  Failed = 'Failed',
  PendingDocs = 'Pending Docs',
  AcceptedOffer = 'Accepted Offer',
  RejectedOffer = 'Rejected Offer',
  RejectedByHr = 'Rejected by HR',
}


import { IsIn, IsInt, IsOptional, IsUUID, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { CandidateTrackerHistoryField } from '../entities/candidate-tracker-status-history.entity';

const TRACKED_FIELD_VALUES: CandidateTrackerHistoryField[] = [
  'status', 'result', 'inPersonInterviewResult', 'inPersonInterviewNotes', 'finalResult',
  'contactAttempt', 'recruiter', 'department', 'source',
  'position', 'location', 'typeOfStaff', 'employmentType', 'interviewType',
  'englishInterview', 'phoneNumber', 'email', 'interviewScheduledAt',
  'interviewCompletedAt', 'observations', 'interviewFeedback',
  'contactAttemptNotes', 'driversLicense', 'englishTestPassed',
  'personalityTestPassed', 'typingTestPassed', 'ageVerified',
  'diplomaTranscript', 'twentyOnePlus', 'backgroundCheckPassed',
  'psychometricTestPassed', 'noAtFaultAccident',
];

export class QueryCandidateTrackerHistoryDto {
  @IsOptional()
  @IsUUID()
  candidateId?: string;

  @IsOptional()
  @IsIn(TRACKED_FIELD_VALUES)
  field?: CandidateTrackerHistoryField;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 100;
}

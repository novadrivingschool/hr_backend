import { PartialType } from '@nestjs/mapped-types';
import { CreateCandidateTrackerDto } from './create-candidate-tracker.dto';

export class UpdateCandidateTrackerDto extends PartialType(CreateCandidateTrackerDto) {}

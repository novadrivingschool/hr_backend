import { PartialType } from '@nestjs/mapped-types';
import { CreateCandidateTrackerPositionDto } from './create-candidate-tracker-position.dto';

export class UpdateCandidateTrackerPositionDto extends PartialType(
  CreateCandidateTrackerPositionDto,
) {}

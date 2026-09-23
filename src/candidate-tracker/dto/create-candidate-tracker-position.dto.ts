import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateCandidateTrackerPositionDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  name: string;
}

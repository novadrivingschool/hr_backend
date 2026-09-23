import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CandidateTracker } from './entities/candidate-tracker.entity';
import { CandidateTrackerStatusHistory } from './entities/candidate-tracker-status-history.entity';
import { CandidateTrackerPosition } from './entities/candidate-tracker-position.entity';
import { CandidateTrackerController } from './candidate-tracker.controller';
import { CandidateTrackerService } from './candidate-tracker.service';
import { CandidateTrackerPositionsController } from './candidate-tracker-positions.controller';
import { CandidateTrackerPositionsService } from './candidate-tracker-positions.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CandidateTracker,
      CandidateTrackerStatusHistory,
      CandidateTrackerPosition,
    ]),
  ],
  controllers: [CandidateTrackerController, CandidateTrackerPositionsController],
  providers: [CandidateTrackerService, CandidateTrackerPositionsService],
  exports: [CandidateTrackerService, CandidateTrackerPositionsService],
})
export class CandidateTrackerModule {}

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CandidateTracker } from './entities/candidate-tracker.entity';
import { CandidateTrackerStatusHistory } from './entities/candidate-tracker-status-history.entity';
import { CandidateTrackerController } from './candidate-tracker.controller';
import { CandidateTrackerService } from './candidate-tracker.service';

@Module({
  imports: [TypeOrmModule.forFeature([CandidateTracker, CandidateTrackerStatusHistory])],
  controllers: [CandidateTrackerController],
  providers: [CandidateTrackerService],
  exports: [CandidateTrackerService],
})
export class CandidateTrackerModule {}

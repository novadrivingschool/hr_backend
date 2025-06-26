import { Module } from '@nestjs/common';
import { ScheduleEventService } from './schedule_event.service';
import { ScheduleEventController } from './schedule_event.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleEvent } from './entities/schedule_event.entity';

@Module({
  imports: [TypeOrmModule.forFeature([ScheduleEvent])],
  controllers: [ScheduleEventController],
  providers: [ScheduleEventService],
  exports: [ScheduleEventService],
})
export class ScheduleEventModule {}

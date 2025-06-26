import { Module } from '@nestjs/common';
import { FixedScheduleService } from './fixed_schedule.service';
import { FixedScheduleController } from './fixed_schedule.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FixedSchedule } from './entities/fixed_schedule.entity';

@Module({
  imports: [TypeOrmModule.forFeature([FixedSchedule])],
  controllers: [FixedScheduleController],
  providers: [FixedScheduleService],
  exports: [FixedScheduleService],
})
export class FixedScheduleModule {}

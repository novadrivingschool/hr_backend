import { Module } from '@nestjs/common';
import { TypeOfScheduleService } from './type_of_schedule.service';
import { TypeOfScheduleController } from './type_of_schedule.controller';
import { TypeOfSchedule } from './entities/type_of_schedule.entity';
import { TypeOrmModule } from '@nestjs/typeorm';

@Module({
  controllers: [TypeOfScheduleController],
  providers: [TypeOfScheduleService],
  imports: [TypeOrmModule.forFeature([TypeOfSchedule])],

})
export class TypeOfScheduleModule { }

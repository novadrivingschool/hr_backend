import { Injectable } from '@nestjs/common';
import { CreateScheduleEventDto } from './dto/create-schedule_event.dto';
import { UpdateScheduleEventDto } from './dto/update-schedule_event.dto';

@Injectable()
export class ScheduleEventService {
  create(createScheduleEventDto: CreateScheduleEventDto) {
    return 'This action adds a new scheduleEvent';
  }

  findAll() {
    return `This action returns all scheduleEvent`;
  }

  findOne(id: number) {
    return `This action returns a #${id} scheduleEvent`;
  }

  update(id: number, updateScheduleEventDto: UpdateScheduleEventDto) {
    return `This action updates a #${id} scheduleEvent`;
  }

  remove(id: number) {
    return `This action removes a #${id} scheduleEvent`;
  }
}

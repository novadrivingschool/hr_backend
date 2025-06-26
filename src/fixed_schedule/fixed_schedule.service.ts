import { Injectable } from '@nestjs/common';
import { CreateFixedScheduleDto } from './dto/create-fixed_schedule.dto';
import { UpdateFixedScheduleDto } from './dto/update-fixed_schedule.dto';

@Injectable()
export class FixedScheduleService {
  create(createFixedScheduleDto: CreateFixedScheduleDto) {
    return 'This action adds a new fixedSchedule';
  }

  findAll() {
    return `This action returns all fixedSchedule`;
  }

  findOne(id: number) {
    return `This action returns a #${id} fixedSchedule`;
  }

  update(id: number, updateFixedScheduleDto: UpdateFixedScheduleDto) {
    return `This action updates a #${id} fixedSchedule`;
  }

  remove(id: number) {
    return `This action removes a #${id} fixedSchedule`;
  }
}

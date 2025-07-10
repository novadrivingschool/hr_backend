import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateScheduleEventDto } from './dto/create-schedule_event.dto';
import { UpdateScheduleEventDto } from './dto/update-schedule_event.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { ScheduleEvent } from './entities/schedule_event.entity';
import { Repository } from 'typeorm';

@Injectable()
export class ScheduleEventService {
  constructor(
    @InjectRepository(ScheduleEvent)
    private readonly scheduleEventRepo: Repository<ScheduleEvent>,
  ) { }
  
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

  async remove(id: number): Promise<{ message: string }> {
    const result = await this.scheduleEventRepo.delete(id);

    if (result.affected === 0) {
      throw new NotFoundException(`ScheduleEvent with id ${id} not found`);
    }

    return { message: `ScheduleEvent with id ${id} has been deleted.` };
  }
}

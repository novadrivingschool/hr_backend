import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateFixedScheduleDto } from './dto/create-fixed_schedule.dto';
import { UpdateFixedScheduleDto } from './dto/update-fixed_schedule.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { FixedSchedule } from './entities/fixed_schedule.entity';
import { Repository } from 'typeorm';

@Injectable()
export class FixedScheduleService {
  constructor(
    @InjectRepository(FixedSchedule)
    private readonly fixedScheduleRepo: Repository<FixedSchedule>,
  ) { }

  create(createFixedScheduleDto: CreateFixedScheduleDto) {
    return 'This action adds a new fixedSchedule';
  }

  findAll() {
    return `This action returns all fixedSchedule`;
  }

  findOne(id: number) {
    return `This action returns a #${id} fixedSchedule`;
  }

  async update(
    id: number,
    updateFixedScheduleDto: UpdateFixedScheduleDto
  ): Promise<FixedSchedule> {
    const schedule = await this.fixedScheduleRepo.findOne({ where: { id } });

    if (!schedule) {
      throw new NotFoundException(`FixedSchedule with id ${id} not found`);
    }

    const updated = Object.assign(schedule, updateFixedScheduleDto);
    return this.fixedScheduleRepo.save(updated);
  }


  async remove(id: number): Promise<{ message: string }> {
    const result = await this.fixedScheduleRepo.delete(id);

    if (result.affected === 0) {
      throw new NotFoundException(`FixedSchedule with id ${id} not found`);
    }

    return { message: `FixedSchedule with id ${id} has been deleted.` };
  }

}

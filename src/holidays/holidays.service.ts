/* src\holidays\holidays.service.ts */
import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Holiday } from './entities/holiday.entity';
import { CreateHolidayDto } from './dto/create-holiday.dto';
import { UpdateHolidayDto } from './dto/update-holiday.dto';

@Injectable()
export class HolidaysService {
  constructor(
    @InjectRepository(Holiday)
    private readonly holidayRepository: Repository<Holiday>,
  ) {}

  async create(createHolidayDto: CreateHolidayDto): Promise<Holiday> {
    const existingHoliday = await this.holidayRepository.findOne({
      where: {
        name: createHolidayDto.name,
        date: createHolidayDto.date,
      },
    });

    if (existingHoliday) {
      throw new ConflictException('A holiday with this name and date already exists');
    }

    const holiday = this.holidayRepository.create({
      ...createHolidayDto,
      type: createHolidayDto.type || 'public',
      is_active:
        createHolidayDto.is_active !== undefined
          ? createHolidayDto.is_active
          : true,
    });

    return await this.holidayRepository.save(holiday);
  }

  async findAll(): Promise<Holiday[]> {
    return await this.holidayRepository.find({
      order: {
        date: 'ASC',
      },
    });
  }

  async findOne(id: string): Promise<Holiday> {
    const holiday = await this.holidayRepository.findOne({
      where: { id },
    });

    if (!holiday) {
      throw new NotFoundException(`Holiday with id ${id} not found`);
    }

    return holiday;
  }

  async update(id: string, updateHolidayDto: UpdateHolidayDto): Promise<Holiday> {
    const holiday = await this.findOne(id);

    const updatedHoliday = this.holidayRepository.merge(holiday, updateHolidayDto);

    return await this.holidayRepository.save(updatedHoliday);
  }

  async remove(id: string): Promise<{ message: string }> {
    const holiday = await this.findOne(id);

    await this.holidayRepository.remove(holiday);

    return {
      message: `Holiday with id ${id} was removed successfully`,
    };
  }
}
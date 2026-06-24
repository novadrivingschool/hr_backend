/* src\holidays\holidays.service.ts */
import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Holiday } from './entities/holiday.entity';
import { HolidayAuditLog } from './entities/holiday-audit-log.entity';
import { CreateHolidayDto, PerformedByDto } from './dto/create-holiday.dto';
import { UpdateHolidayDto } from './dto/update-holiday.dto';

@Injectable()
export class HolidaysService {
  constructor(
    @InjectRepository(Holiday)
    private readonly holidayRepository: Repository<Holiday>,

    @InjectRepository(HolidayAuditLog)
    private readonly auditRepository: Repository<HolidayAuditLog>,
  ) {}

  private async log(
    action: string,
    holiday: Holiday,
    performedBy?: PerformedByDto,
    changes?: Record<string, any>,
  ) {
    const entry = this.auditRepository.create({
      holiday_id: holiday.id,
      holiday_name: holiday.name,
      action,
      performed_by_name: performedBy
        ? `${performedBy.name || ''} ${performedBy.last_name || ''}`.trim()
        : undefined,
      performed_by_employee_number: performedBy?.employee_number ?? undefined,
      changes: changes ?? undefined,
    } as Partial<HolidayAuditLog>);
    await this.auditRepository.save(entry);
  }

  async create(createHolidayDto: CreateHolidayDto): Promise<Holiday> {
    const { performed_by, ...holidayData } = createHolidayDto;

    const existingHoliday = await this.holidayRepository.findOne({
      where: {
        name: holidayData.name,
        date: holidayData.date,
      },
    });

    if (existingHoliday) {
      throw new ConflictException('A holiday with this name and date already exists');
    }

    const holiday = this.holidayRepository.create({
      ...holidayData,
      type: holidayData.type || 'public',
      is_active: holidayData.is_active !== undefined ? holidayData.is_active : true,
    });

    const saved = await this.holidayRepository.save(holiday);

    await this.log('created', saved, performed_by, {
      after: {
        name: saved.name,
        date: saved.date,
        type: saved.type,
        is_active: saved.is_active,
      },
    });

    return saved;
  }

  async findAll(): Promise<Holiday[]> {
    return await this.holidayRepository.find({
      order: { date: 'ASC' },
    });
  }

  async findOne(id: string): Promise<Holiday> {
    const holiday = await this.holidayRepository.findOne({ where: { id } });

    if (!holiday) {
      throw new NotFoundException(`Holiday with id ${id} not found`);
    }

    return holiday;
  }

  async update(
    id: string,
    updateHolidayDto: UpdateHolidayDto,
  ): Promise<Holiday> {
    const { performed_by, ...updateData } = updateHolidayDto;

    const holiday = await this.findOne(id);

    const before = {
      name: holiday.name,
      date: holiday.date,
      type: holiday.type,
      is_active: holiday.is_active,
    };

    const updatedHoliday = this.holidayRepository.merge(holiday, updateData);
    const saved = await this.holidayRepository.save(updatedHoliday);

    const after = {
      name: saved.name,
      date: saved.date,
      type: saved.type,
      is_active: saved.is_active,
    };

    // Determinar si fue toggle de active o edición general
    const onlyActiveChanged =
      Object.keys(updateData).length === 1 && 'is_active' in updateData;

    let action: string;
    if (onlyActiveChanged) {
      action = saved.is_active ? 'activated' : 'deactivated';
    } else {
      action = 'updated';
    }

    await this.log(action, saved, performed_by, { before, after });

    return saved;
  }

  async remove(id: string, performedBy?: PerformedByDto): Promise<{ message: string }> {
    const holiday = await this.findOne(id);

    // Guardar el log ANTES de eliminar (necesitamos los datos del holiday)
    await this.log('deleted', holiday, performedBy, {
      before: {
        name: holiday.name,
        date: holiday.date,
        type: holiday.type,
        is_active: holiday.is_active,
      },
    });

    await this.holidayRepository.remove(holiday);

    return {
      message: `Holiday with id ${id} was removed successfully`,
    };
  }

  async findAuditLog(): Promise<HolidayAuditLog[]> {
    return await this.auditRepository.find({
      order: { created_at: 'DESC' },
    });
  }
}

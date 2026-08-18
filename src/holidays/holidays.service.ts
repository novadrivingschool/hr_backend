/* src\holidays\holidays.service.ts */
import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, Repository } from 'typeorm';

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
        authorized_hours: saved.authorized_hours,
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
      authorized_hours: holiday.authorized_hours,
      is_active: holiday.is_active,
    };

    const updatedHoliday = this.holidayRepository.merge(holiday, updateData);
    const saved = await this.holidayRepository.save(updatedHoliday);

    const after = {
      name: saved.name,
      date: saved.date,
      type: saved.type,
      authorized_hours: saved.authorized_hours,
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
        authorized_hours: holiday.authorized_hours,
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

  /**
   * Historial de un holiday A TRAVÉS DE LOS AÑOS (no el audit log general).
   * Cada año un holiday es un registro distinto (misma "name", "date" diferente),
   * así que agrupamos por nombre (case-insensitive) para poder comparar cuántas
   * horas se autorizaron en años anteriores vs. el registro actual.
   *
   * Incluye también instancias ya borradas (rescatadas del audit log con
   * action='deleted') para que el historial no se pierda si algún año se
   * limpia la tabla de holidays.
   */
  async findHistory(id: string): Promise<{
    holiday_name: string;
    records: Array<{
      source: 'current' | 'deleted';
      id: string;
      date: string | null;
      authorized_hours: number | null;
      is_active?: boolean;
      deleted_at?: Date;
    }>;
  }> {
    const holiday = await this.findOne(id);
    const name = holiday.name;

    const currentRows = await this.holidayRepository.find({
      where: { name: ILike(name) },
      order: { date: 'DESC' },
    });

    const deletedEntries = await this.auditRepository.find({
      where: { holiday_name: ILike(name), action: 'deleted' },
      order: { created_at: 'DESC' },
    });

    const currentIds = new Set(currentRows.map((h) => h.id));

    const records = [
      ...currentRows.map((h) => ({
        source: 'current' as const,
        id: h.id,
        date: h.date,
        authorized_hours: h.authorized_hours,
        is_active: h.is_active,
      })),
      // Si un id ya fue re-creado con el mismo nombre no debería duplicarse,
      // pero por las dudas filtramos deletes cuyo id siga vivo en currentRows.
      ...deletedEntries
        .filter((e) => !currentIds.has(e.holiday_id))
        .map((e) => ({
          source: 'deleted' as const,
          id: e.holiday_id,
          date: (e.changes?.before?.date as string) ?? null,
          authorized_hours: (e.changes?.before?.authorized_hours as number) ?? null,
          deleted_at: e.created_at,
        })),
    ].sort((a, b) => String(b.date ?? '').localeCompare(String(a.date ?? '')));

    return { holiday_name: name, records };
  }
}

import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { Logbook } from './entities/logbook.entity';
import { CreateLogbookDto } from './dto/create-logbook.dto';
import { FilterLogbookDto } from './dto/filter-logbook.dto';
import { sectionDateMap } from './map/logbook-section-date.map';
import { UpdateLogbookDto } from './dto/update-logbook.dto';


@Injectable()
export class LogbookService {
  constructor(
    @InjectRepository(Logbook)
    private readonly logbookRepo: Repository<Logbook>,
  ) { }

  async create(dto: CreateLogbookDto) {
    const entry = this.logbookRepo.create(dto);
    return await this.logbookRepo.save(entry);
  }

  async findAll() {
    return await this.logbookRepo.find({
      order: { created_at: 'DESC' }
    });
  }

  async findFiltered(dto: FilterLogbookDto) {
    const query = this.logbookRepo.createQueryBuilder('log');

    if (dto.employee_number) {
      query.andWhere("log.employee_data ->> 'employee_number' = :emp", {
        emp: dto.employee_number,
      });
    }

    if (dto.section) {
      query.andWhere('log.section = :section', { section: dto.section });

      const field = sectionDateMap[dto.section];
      if (field && dto.date_from && dto.date_to) {
        query.andWhere(`log.data ->> :field BETWEEN :from AND :to`, {
          field,
          from: dto.date_from,
          to: dto.date_to,
        });
      }
    }

    return query.orderBy('log.created_at', 'DESC').getMany();
  }

  async update(id: string, dto: UpdateLogbookDto) {
    const existing = await this.logbookRepo.findOne({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`Logbook entry with id ${id} not found`);
    }

    // Actualizar campos
    /* if (dto.employee_data !== undefined) {
      existing.employee_data = dto.employee_data;
    }
    if (dto.section !== undefined) {
      existing.section = dto.section;
    } */
    if (dto.data !== undefined) {
      existing.data = dto.data;
    }

    return this.logbookRepo.save(existing);
  }

  async remove(id: string) {
    const existing = await this.logbookRepo.findOne({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`Logbook entry with id ${id} not found`);
    }

    await this.logbookRepo.remove(existing);
    return { message: 'Logbook entry deleted successfully', id };
  }
}

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { Logbook } from './entities/logbook.entity';
import { CreateLogbookDto } from './dto/create-logbook.dto';
import { FilterLogbookDto } from './dto/filter-logbook.dto';
import { sectionDateMap } from './map/logbook-section-date.map';


@Injectable()
export class LogbookService {
  constructor(
    @InjectRepository(Logbook)
    private readonly repo: Repository<Logbook>,
  ) {}

  async create(dto: CreateLogbookDto) {
    const entry = this.repo.create(dto);
    return await this.repo.save(entry);
  }

  async findAll() {
    return await this.repo.find({
      order: { created_at: 'DESC' }
    });
  }

  async findFiltered(dto: FilterLogbookDto) {
    const query = this.repo.createQueryBuilder('log');

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
}

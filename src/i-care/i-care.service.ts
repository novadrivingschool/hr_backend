import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateICareDto } from './dto/create-i-care.dto';
import { ICare } from './entities/i-care.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as moment from 'moment-timezone';
import { UpdateICareDto } from './dto/update-i-care.dto';
import { CommitICareDto } from './dto/commit-i-care.dto';
import { Logger } from '@nestjs/common';
import axios from 'axios';

// Envelope que devuelven los métodos paginados
export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  pageCount: number;
}

@Injectable()
export class ICareService {
  private readonly logger = new Logger(ICareService.name);

  constructor(
    @InjectRepository(ICare)
    private readonly iCareRepository: Repository<ICare>,
  ) {}

  // ── Create ─────────────────────────────────────────────────────────────────

  async create(createICareDto: CreateICareDto): Promise<ICare> {
    const record = this.iCareRepository.create(createICareDto);
    const saved = await this.iCareRepository.save(record);

    // Enviar correo sin bloquear la respuesta
    this.triggerICareEmail(saved.id).catch((error) => {
      this.logger.error(
        `❌ Failed to trigger iCare email for id=${saved.id}`,
        error?.message || error,
      );
    });

    return saved;
  }

  private async triggerICareEmail(id: string): Promise<void> {
    if (!id) return;

    const emailServiceBase = process.env.EMAIL_SERVICE_BASE;

    if (!emailServiceBase) {
      this.logger.error('❌ EMAIL_SERVICE_BASE is not configured');
      return;
    }

    await axios.post(`${emailServiceBase}/mailer-send/i-care/${id}`);
  }

  // ── FindAll (paginado) ─────────────────────────────────────────────────────

  async findAll(page = 1, limit = 15): Promise<PaginatedResult<ICare>> {
    try {
      console.log('Fetching all ICare records — page:', page, 'limit:', limit);

      const [records, total] = await this.iCareRepository.findAndCount({
        order: { createdAt: 'DESC' },
        skip: (page - 1) * limit,
        take: limit,
      });

      console.log('ICare records fetched:', total, 'total,', records.length, 'in page');

      return {
        data: this.transformDates(records),
        total,
        page,
        limit,
        pageCount: Math.ceil(total / limit),
      };
    } catch (error) {
      console.error('Error fetching ICare records:', error);
      throw error;
    }
  }

  // ── FindOne ────────────────────────────────────────────────────────────────

  async findOne(id: string): Promise<ICare> {
    try {
      console.log('Fetching ICare record with ID:', id);
      const record = await this.iCareRepository.findOne({ where: { id } });

      if (!record) {
        throw new NotFoundException(`ICare record with id ${id} not found`);
      }

      return this.transformDates([record])[0];
    } catch (error) {
      console.error('Error fetching ICare record with ID:', id, error);
      throw error;
    }
  }

  // ── Update ─────────────────────────────────────────────────────────────────

  async update(id: string, updateICareDto: UpdateICareDto): Promise<ICare> {
    const existingRecord = await this.iCareRepository.findOne({ where: { id } });

    if (!existingRecord) {
      throw new NotFoundException(`ICare record with ID ${id} not found`);
    }

    const updatedRecord = {
      ...existingRecord,
      ...updateICareDto,
      date: updateICareDto.date ?? existingRecord.date,
      updatedAt: new Date(),
    };

    return await this.iCareRepository.save(updatedRecord);
  }

  // ── Remove ─────────────────────────────────────────────────────────────────

  async remove(id: string): Promise<void> {
    try {
      console.log('Removing ICare record with ID:', id);
      const record = await this.findOne(id);
      await this.iCareRepository.remove(record);
      console.log('ICare record removed');
    } catch (error) {
      console.error('Error removing ICare record with ID:', id, error);
      throw error;
    }
  }

  // ── FindByFilters (paginado) ───────────────────────────────────────────────

  async findByFilters(
    filters: {
      dateFrom?: string;
      dateTo?: string;
      submitterEmployeeNumber?: string;
      staffEmployeeNumber?: string;
      responsibleEmployeeNumber?: string;
      urgency?: string;
      committed?: boolean;
    },
    page = 1,
    limit = 15,
  ): Promise<PaginatedResult<ICare>> {
    try {
      console.log('Searching ICare records — page:', page, 'limit:', limit, 'filters:', filters);

      const query = this.iCareRepository.createQueryBuilder('icare');

      // ── Filtros ────────────────────────────────────────────────────────────

      if (filters.dateFrom && filters.dateTo) {
        query.andWhere('icare.date BETWEEN :dateFrom AND :dateTo', {
          dateFrom: filters.dateFrom,
          dateTo: filters.dateTo,
        });
      }

      if (filters.submitterEmployeeNumber) {
        query.andWhere(
          `icare.submitter->>'employee_number' = :submitterEmpNum`,
          { submitterEmpNum: filters.submitterEmployeeNumber },
        );
      }

      if (filters.staffEmployeeNumber) {
        query.andWhere(
          `icare.staff_name->>'employee_number' = :staffEmpNum`,
          { staffEmpNum: filters.staffEmployeeNumber },
        );
      }

      if (filters.responsibleEmployeeNumber) {
        query.andWhere(
          `icare.responsible::jsonb @> :respQuery`,
          {
            respQuery: JSON.stringify([
              { employee_number: filters.responsibleEmployeeNumber },
            ]),
          },
        );
      }

      if (filters.urgency) {
        query.andWhere('icare.urgency = :urgency', { urgency: filters.urgency });
      }

      if (filters.committed !== undefined) {
        query.andWhere('icare.committed = :committed', { committed: filters.committed });
      }

      // ── Orden + paginación ─────────────────────────────────────────────────

      query
        .orderBy('icare.createdAt', 'DESC')
        .skip((page - 1) * limit)
        .take(limit);

      // getManyAndCount ejecuta SELECT + COUNT en una sola llamada
      const [records, total] = await query.getManyAndCount();

      console.log('ICare records found:', total, 'total,', records.length, 'in page');

      return {
        data: this.transformDates(records),
        total,
        page,
        limit,
        pageCount: Math.ceil(total / limit),
      };
    } catch (error) {
      console.error('Error searching ICare records:', error);
      throw error;
    }
  }

  // ── FindByCurrentSubmitter ─────────────────────────────────────────────────
  // Sin paginación — se usa para vistas personales del empleado

  async findByCurrentSubmitter(employeeNumber: string): Promise<ICare[]> {
    try {
      console.log('Fetching ICare records by submitter:', employeeNumber);

      const records = await this.iCareRepository.find({
        where: { submitter: { employee_number: employeeNumber } },
        order: { createdAt: 'DESC' },
      });

      console.log('ICare records found:', records.length);
      return this.transformDates(records);
    } catch (error) {
      console.error('Error fetching ICare records by submitter:', error);
      throw error;
    }
  }

  // ── FindByStaff ────────────────────────────────────────────────────────────

  async findByStaff(employeeNumber: string): Promise<ICare[]> {
    try {
      console.log('Fetching ICare records by staff:', employeeNumber);

      const records = await this.iCareRepository.find({
        where: { staff_name: { employee_number: employeeNumber } },
        order: { createdAt: 'DESC' },
      });

      console.log('ICare records found:', records.length);
      return this.transformDates(records);
    } catch (error) {
      console.error('Error fetching ICare records by staff:', error);
      throw error;
    }
  }

  // ── GetStats ───────────────────────────────────────────────────────────────
  // Los KPIs siempre son globales (sin filtro de committed)
  // para que los stat cards reflejen el total real de la BD.

  async getStats(
    filters: {
      dateFrom?: string;
      dateTo?: string;
      submitterEmployeeNumber?: string;
      staffEmployeeNumber?: string;
      urgency?: string;
    } = {},
  ): Promise<any> {
    try {
      console.log('Fetching ICare statistics:', filters);

      // Total general (respetando los filtros opcionales que pueda traer)
      const baseQuery = this.iCareRepository.createQueryBuilder('icare');

      if (filters.dateFrom && filters.dateTo) {
        baseQuery.andWhere('icare.date BETWEEN :dateFrom AND :dateTo', {
          dateFrom: filters.dateFrom,
          dateTo: filters.dateTo,
        });
      }

      if (filters.submitterEmployeeNumber) {
        baseQuery.andWhere(
          `icare.submitter->>'employee_number' = :submitterEmpNum`,
          { submitterEmpNum: filters.submitterEmployeeNumber },
        );
      }

      if (filters.staffEmployeeNumber) {
        baseQuery.andWhere(
          `icare.staff_name->>'employee_number' = :staffEmpNum`,
          { staffEmpNum: filters.staffEmployeeNumber },
        );
      }

      if (filters.urgency) {
        baseQuery.andWhere('icare.urgency = :urgency', { urgency: filters.urgency });
      }

      const totalRecords = await baseQuery.getCount();

      // Distribución por urgencia (global, sin filtros)
      const urgencyDistribution = await this.iCareRepository
        .createQueryBuilder('icare')
        .select('icare.urgency', 'urgency')
        .addSelect('COUNT(*)', 'count')
        .groupBy('icare.urgency')
        .getRawMany();

      // Tendencia mensual (últimos 6 meses)
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

      const monthlyTrend = await this.iCareRepository
        .createQueryBuilder('icare')
        .select(`DATE_TRUNC('month', icare.createdAt)`, 'month')
        .addSelect('COUNT(*)', 'count')
        .where('icare.createdAt >= :sixMonthsAgo', { sixMonthsAgo })
        .groupBy(`DATE_TRUNC('month', icare.createdAt)`)
        .orderBy('month', 'DESC')
        .getRawMany();

      // Counts de committed / pending (siempre globales)
      const committedCount = await this.iCareRepository.count({
        where: { committed: true },
      });

      const pendingCount = await this.iCareRepository.count({
        where: { committed: false },
      });

      const stats = {
        totalRecords,
        committedCount,
        pendingCount,
        urgencyDistribution,
        monthlyTrend,
        timestamp: new Date().toISOString(),
      };

      console.log('ICare statistics fetched');
      return stats;
    } catch (error) {
      console.error('Error fetching ICare statistics:', error);
      throw error;
    }
  }

  // ── Commit ─────────────────────────────────────────────────────────────────

  async commit(id: string, dto: CommitICareDto): Promise<ICare> {
    try {
      console.log('Committing ICare record:', id, dto);

      const record = await this.iCareRepository.findOne({ where: { id } });
      if (!record) {
        throw new NotFoundException(`ICare record with id ${id} not found`);
      }

      const now = moment().tz('America/Chicago');
      record.committed = dto.committed;

      if (dto.committed) {
        record.committed_date  = dto.committed_date  ?? now.format('YYYY-MM-DD');
        record.committed_time  = dto.committed_time  ?? now.format('HH:mm');
        record.committed_notes = dto.committed_notes ?? record.committed_notes ?? null;
      } else {
        // Revocar commitment — limpiar campos relacionados
        record.committed_date  = null;
        record.committed_time  = null;
        record.committed_notes = null;
      }

      const saved = await this.iCareRepository.save(record);
      console.log('ICare record committed:', saved.id);
      return this.transformDates([saved])[0];
    } catch (error) {
      console.error('Error committing ICare record:', id, error);
      throw error;
    }
  }

  // ── Search (full-text) ─────────────────────────────────────────────────────

  async search(
    queryStr: string,
    filters: {
      dateFrom?: string;
      dateTo?: string;
      urgency?: string;
    } = {},
  ): Promise<ICare[]> {
    try {
      console.log('Full-text search — query:', queryStr, 'filters:', filters);

      const searchQuery = this.iCareRepository
        .createQueryBuilder('icare')
        .where(
          `(
            icare.reason ILIKE :q OR
            icare.details ILIKE :q OR
            icare.submitter->>'name' ILIKE :q OR
            icare.submitter->>'last_name' ILIKE :q OR
            icare.submitter->>'employee_number' ILIKE :q OR
            icare.staff_name->>'name' ILIKE :q OR
            icare.staff_name->>'last_name' ILIKE :q OR
            icare.staff_name->>'employee_number' ILIKE :q
          )`,
          { q: `%${queryStr}%` },
        );

      if (filters.dateFrom && filters.dateTo) {
        searchQuery.andWhere('icare.date BETWEEN :dateFrom AND :dateTo', {
          dateFrom: filters.dateFrom,
          dateTo: filters.dateTo,
        });
      }

      if (filters.urgency) {
        searchQuery.andWhere('icare.urgency = :urgency', { urgency: filters.urgency });
      }

      searchQuery.orderBy('icare.createdAt', 'DESC');

      const records = await searchQuery.getMany();
      console.log('Search results:', records.length);
      return this.transformDates(records);
    } catch (error) {
      console.error('Error in full-text search:', error);
      throw error;
    }
  }

  // ── Batch operations ───────────────────────────────────────────────────────

  async batchUpdate(ids: string[], updates: UpdateICareDto): Promise<{ updated: number }> {
    try {
      console.log('Batch updating ICare records:', ids.length);

      const result = await this.iCareRepository
        .createQueryBuilder()
        .update(ICare)
        .set(updates)
        .where('id IN (:...ids)', { ids })
        .execute();

      return { updated: result.affected || 0 };
    } catch (error) {
      console.error('Error in batch update:', error);
      throw error;
    }
  }

  async batchDelete(ids: string[]): Promise<{ deleted: number }> {
    try {
      console.log('Batch deleting ICare records:', ids.length);

      const result = await this.iCareRepository
        .createQueryBuilder()
        .delete()
        .from(ICare)
        .where('id IN (:...ids)', { ids })
        .execute();

      return { deleted: result.affected || 0 };
    } catch (error) {
      console.error('Error in batch delete:', error);
      throw error;
    }
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private transformDates(records: ICare[]): ICare[] {
    return records.map(record => ({
      ...record,
      createdAt: moment(record.createdAt)
        .tz('America/Chicago')
        .format('YYYY-MM-DD HH:mm:ss') as any,
      updatedAt: moment(record.updatedAt)
        .tz('America/Chicago')
        .format('YYYY-MM-DD HH:mm:ss') as any,
    }));
  }
}
import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateICareDto } from './dto/create-i-care.dto';
import { ICare } from './entities/i-care.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, ILike } from 'typeorm';
import * as moment from 'moment-timezone';
import { UpdateICareDto } from './dto/update-i-care.dto';
import { Logger } from '@nestjs/common';
import axios from 'axios';

@Injectable()
export class ICareService {
  private readonly logger = new Logger(ICareService.name);

  constructor(
    @InjectRepository(ICare)
    private readonly iCareRepository: Repository<ICare>,
  ) { }

  async create(createICareDto: CreateICareDto): Promise<ICare> {
    const record = this.iCareRepository.create(createICareDto);
    const saved = await this.iCareRepository.save(record);

    // 🔔 Enviar correo (NO bloquea la creación)
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
      this.logger.error(
        '❌ EMAIL_SERVICE_BASE is not configured, cannot trigger iCare email',
      );
      return;
    }

    // 👉 Llama al servicio de correos
    await axios.post(`${emailServiceBase}/mailer-send/i-care/${id}`);
  }

  async findAll(): Promise<ICare[]> {
    try {
      console.log('Fetching all ICare records');
      const records = await this.iCareRepository.find({
        order: { createdAt: 'DESC' },
      });
      console.log('ICare records fetched:', records);
      return this.transformDates(records);
    } catch (error) {
      console.error('Error fetching ICare records:', error);
      throw error;
    }
  }

  async findOne(id: string): Promise<ICare> {
    try {
      console.log('Fetching ICare record with ID:', id);
      const record = await this.iCareRepository.findOne({ where: { id } });

      if (!record) {
        console.error(`ICare record with id ${id} not found`);
        throw new NotFoundException(`ICare record with id ${id} not found`);
      }

      console.log('ICare record fetched:', record);
      return this.transformDates([record])[0];
    } catch (error) {
      console.error('Error fetching ICare record with ID:', id, error);
      throw error;
    }
  }

  async update(id: string, updateICareDto: UpdateICareDto): Promise<ICare> {
    // Verificar que el registro exista
    const existingRecord = await this.iCareRepository.findOne({ where: { id } });

    if (!existingRecord) {
      throw new NotFoundException(`ICare record with ID ${id} not found`);
    }

    // Actualizar solo los campos proporcionados
    const updatedRecord = {
      ...existingRecord,
      ...updateICareDto,
      // Asegurar que las fechas sean strings ISO
      date: updateICareDto.date ? updateICareDto.date : existingRecord.date,
      updatedAt: new Date()
    };

    return await this.iCareRepository.save(updatedRecord);
  }

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

  async findByFilters(filters: {
    dateFrom?: string;
    dateTo?: string;
    submitterEmployeeNumber?: string;
    staffEmployeeNumber?: string; // NUEVO: para staff_name
    responsibleEmployeeNumber?: string;
    urgency?: string;
  }): Promise<ICare[]> {
    try {
      console.log('Searching ICare records with filters:', filters);
      const query = this.iCareRepository.createQueryBuilder('icare');

      if (filters.dateFrom && filters.dateTo) {
        query.andWhere('icare.date BETWEEN :dateFrom AND :dateTo', {
          dateFrom: filters.dateFrom,
          dateTo: filters.dateTo,
        });
      }

      if (filters.submitterEmployeeNumber) {
        query.andWhere(
          `icare.submitter->>'employee_number' = :submitterEmpNum`,
          { submitterEmpNum: filters.submitterEmployeeNumber }
        );
      }

      // NUEVO: Filtro por staff_name
      if (filters.staffEmployeeNumber) {
        query.andWhere(
          `icare.staff_name->>'employee_number' = :staffEmpNum`,
          { staffEmpNum: filters.staffEmployeeNumber }
        );
      }

      if (filters.responsibleEmployeeNumber) {
        query.andWhere(
          `icare.responsible::jsonb @> :respQuery`,
          {
            respQuery: JSON.stringify([{ employee_number: filters.responsibleEmployeeNumber }])
          }
        );
      }

      if (filters.urgency) {
        query.andWhere('icare.urgency = :urgency', { urgency: filters.urgency });
      }

      query.orderBy('icare.createdAt', 'DESC');

      const records = await query.getMany();
      console.log('ICare records found:', records);
      return this.transformDates(records);
    } catch (error) {
      console.error('Error searching ICare records:', error);
      throw error;
    }
  }

  // NUEVO: Método para obtener registros por submitter (empleado actual)
  async findByCurrentSubmitter(employeeNumber: string): Promise<ICare[]> {
    try {
      console.log('Fetching ICare records by submitter employee number:', employeeNumber);
      const records = await this.iCareRepository.find({
        where: {
          submitter: {
            employee_number: employeeNumber
          }
        },
        order: { createdAt: 'DESC' },
      });
      console.log('ICare records found:', records);
      return this.transformDates(records);
    } catch (error) {
      console.error('Error fetching ICare records by submitter:', error);
      throw error;
    }
  }

  // NUEVO: Método para obtener registros por staff_name
  async findByStaff(employeeNumber: string): Promise<ICare[]> {
    try {
      console.log('Fetching ICare records by staff employee number:', employeeNumber);
      const records = await this.iCareRepository.find({
        where: {
          staff_name: {
            employee_number: employeeNumber
          }
        },
        order: { createdAt: 'DESC' },
      });
      console.log('ICare records found:', records);
      return this.transformDates(records);
    } catch (error) {
      console.error('Error fetching ICare records by staff:', error);
      throw error;
    }
  }

  // NUEVO: Método para obtener estadísticas
  async getStats(filters: {
    dateFrom?: string;
    dateTo?: string;
    submitterEmployeeNumber?: string;
    staffEmployeeNumber?: string;
    urgency?: string;
  } = {}): Promise<any> {
    try {
      console.log('Fetching ICare statistics with filters:', filters);
      
      const query = this.iCareRepository.createQueryBuilder('icare');
      
      // Aplicar filtros
      if (filters.dateFrom && filters.dateTo) {
        query.andWhere('icare.date BETWEEN :dateFrom AND :dateTo', {
          dateFrom: filters.dateFrom,
          dateTo: filters.dateTo,
        });
      }

      if (filters.submitterEmployeeNumber) {
        query.andWhere(
          `icare.submitter->>'employee_number' = :submitterEmpNum`,
          { submitterEmpNum: filters.submitterEmployeeNumber }
        );
      }

      if (filters.staffEmployeeNumber) {
        query.andWhere(
          `icare.staff_name->>'employee_number' = :staffEmpNum`,
          { staffEmpNum: filters.staffEmployeeNumber }
        );
      }

      if (filters.urgency) {
        query.andWhere('icare.urgency = :urgency', { urgency: filters.urgency });
      }

      const totalRecords = await query.getCount();
      
      // Obtener distribución por urgencia
      const urgencyStats = await this.iCareRepository
        .createQueryBuilder('icare')
        .select('icare.urgency', 'urgency')
        .addSelect('COUNT(*)', 'count')
        .groupBy('icare.urgency')
        .getRawMany();

      // Obtear registros por mes (últimos 6 meses)
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
      
      const monthlyStats = await this.iCareRepository
        .createQueryBuilder('icare')
        .select(`DATE_TRUNC('month', icare.createdAt)`, 'month')
        .addSelect('COUNT(*)', 'count')
        .where('icare.createdAt >= :sixMonthsAgo', { sixMonthsAgo })
        .groupBy(`DATE_TRUNC('month', icare.createdAt)`)
        .orderBy('month', 'DESC')
        .getRawMany();

      const stats = {
        totalRecords,
        urgencyDistribution: urgencyStats,
        monthlyTrend: monthlyStats,
        timestamp: new Date().toISOString()
      };

      console.log('ICare statistics fetched:', stats);
      return stats;
    } catch (error) {
      console.error('Error fetching ICare statistics:', error);
      throw error;
    }
  }

  // NUEVO: Método para exportar a CSV
  async exportToCSV(filters: {
    dateFrom?: string;
    dateTo?: string;
    submitterEmployeeNumber?: string;
    staffEmployeeNumber?: string;
    urgency?: string;
  } = {}): Promise<ICare[]> {
    try {
      console.log('Exporting ICare records to CSV with filters:', filters);
      const records = await this.findByFilters(filters);
      console.log('Records for export:', records.length);
      return records;
    } catch (error) {
      console.error('Error exporting ICare records:', error);
      throw error;
    }
  }

  // NUEVO: Método para búsqueda avanzada (full-text)
  async search(query: string, filters: {
    dateFrom?: string;
    dateTo?: string;
    urgency?: string;
  } = {}): Promise<ICare[]> {
    try {
      console.log('Searching ICare records with query:', query, 'and filters:', filters);
      
      const searchQuery = this.iCareRepository.createQueryBuilder('icare');
      
      // Búsqueda full-text en múltiples campos
      searchQuery.where(
        `(
          icare.reason ILIKE :query OR 
          icare.details ILIKE :query OR
          icare.submitter->>'name' ILIKE :query OR
          icare.submitter->>'last_name' ILIKE :query OR
          icare.submitter->>'employee_number' ILIKE :query OR
          icare.staff_name->>'name' ILIKE :query OR
          icare.staff_name->>'last_name' ILIKE :query OR
          icare.staff_name->>'employee_number' ILIKE :query
        )`,
        { query: `%${query}%` }
      );

      // Aplicar filtros adicionales
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
      console.log('Search results found:', records.length);
      return this.transformDates(records);
    } catch (error) {
      console.error('Error searching ICare records:', error);
      throw error;
    }
  }

  // NUEVO: Método para operaciones batch
  async batchUpdate(ids: string[], updates: UpdateICareDto): Promise<{ updated: number }> {
    try {
      console.log('Batch updating ICare records:', ids, 'with updates:', updates);
      
      const result = await this.iCareRepository
        .createQueryBuilder()
        .update(ICare)
        .set(updates)
        .where('id IN (:...ids)', { ids })
        .execute();

      console.log('Batch update result:', result);
      return { updated: result.affected || 0 };
    } catch (error) {
      console.error('Error in batch update:', error);
      throw error;
    }
  }

  // NUEVO: Método para eliminar batch
  async batchDelete(ids: string[]): Promise<{ deleted: number }> {
    try {
      console.log('Batch deleting ICare records:', ids);
      
      const result = await this.iCareRepository
        .createQueryBuilder()
        .delete()
        .from(ICare)
        .where('id IN (:...ids)', { ids })
        .execute();

      console.log('Batch delete result:', result);
      return { deleted: result.affected || 0 };
    } catch (error) {
      console.error('Error in batch delete:', error);
      throw error;
    }
  }

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
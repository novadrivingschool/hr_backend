import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { Agreement, AgreementNote, AgreementPerson } from './entities/agreement.entity';
import { CreateAgreementDto } from './dto/create-agreement.dto';
import { UpdateAgreementDto } from './dto/update-agreement.dto';
import { AddAgreementNoteDto } from './dto/add-agreement-note.dto';
import { SoftDeleteAgreementDto } from './dto/soft-delete-agreement.dto';

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  pageCount: number;
}

export type AgreementComputedStatus = 'upcoming' | 'active' | 'expired';

export interface AgreementFilters {
  search?: string;
  status?: AgreementComputedStatus;
  /** Filtra por el `employee_number` exacto del empleado (no del responsible) -- usado por la pestaña Agreements en Employees. */
  employeeNumber?: string;
}

@Injectable()
export class AgreementService {
  private readonly logger = new Logger(AgreementService.name);

  constructor(
    @InjectRepository(Agreement)
    private readonly agreementRepository: Repository<Agreement>,
  ) {}

  async create(dto: CreateAgreementDto): Promise<Agreement> {
    const record = this.agreementRepository.create({
      employee: {
        ...dto.employee,
        multi_position: dto.employee.multi_position ?? [],
        multi_department: dto.employee.multi_department ?? [],
      },
      responsible: dto.responsible,
      start_date: dto.start_date,
      end_date: dto.end_date ?? null,
      reason: dto.reason,
      created_by: dto.created_by ?? null,
      notes: [],
      attachments: [],
    });
    const saved = await this.agreementRepository.save(record);
    return this.withComputedStatus(saved);
  }

  async findAll(page = 1, limit = 15, filters: AgreementFilters = {}): Promise<PaginatedResult<Agreement>> {
    try {
      const qb = this.agreementRepository.createQueryBuilder('agreement');
      qb.andWhere('agreement.deletedAt IS NULL');

      if (filters.search?.trim()) {
        const term = `%${filters.search.trim().toLowerCase()}%`;
        qb.andWhere(
          `(LOWER(agreement.employee ->> 'name') LIKE :term
            OR LOWER(agreement.employee ->> 'last_name') LIKE :term
            OR LOWER(agreement.employee ->> 'employee_number') LIKE :term
            OR LOWER(agreement.responsible ->> 'name') LIKE :term
            OR LOWER(agreement.responsible ->> 'last_name') LIKE :term
            OR LOWER(agreement.reason) LIKE :term)`,
          { term },
        );
      }

      if (filters.employeeNumber?.trim()) {
        qb.andWhere(`agreement.employee ->> 'employee_number' = :employeeNumber`, {
          employeeNumber: filters.employeeNumber.trim(),
        });
      }

      if (filters.status) {
        const today = this.today();
        if (filters.status === 'upcoming') {
          qb.andWhere('agreement.start_date > :today', { today });
        } else if (filters.status === 'expired') {
          qb.andWhere('agreement.end_date IS NOT NULL AND agreement.end_date < :today', { today });
        } else if (filters.status === 'active') {
          qb.andWhere('agreement.start_date <= :today', { today }).andWhere(
            '(agreement.end_date IS NULL OR agreement.end_date >= :today)',
            { today },
          );
        }
      }

      qb.orderBy('agreement.createdAt', 'DESC')
        .skip((page - 1) * limit)
        .take(limit);

      const [records, total] = await qb.getManyAndCount();

      return {
        data: records.map(r => this.withComputedStatus(r)),
        total,
        page,
        limit,
        pageCount: Math.max(Math.ceil(total / limit), 1),
      };
    } catch (error) {
      this.logger.error('Error fetching Agreement records:', error);
      throw error;
    }
  }

  async findOne(id: string): Promise<Agreement> {
    const record = await this.agreementRepository.findOneBy({ id });
    if (!record || record.deletedAt) throw new NotFoundException(`Agreement ${id} not found`);
    return this.withComputedStatus(record);
  }

  async update(id: string, dto: UpdateAgreementDto): Promise<Agreement> {
    const record = await this.agreementRepository.findOneBy({ id });
    if (!record || record.deletedAt) throw new NotFoundException(`Agreement ${id} not found`);

    // created_by nunca se pisa en un update — es el autor original.
    const { created_by, ...patch } = dto;
    this.agreementRepository.merge(record, patch as Partial<Agreement>);
    if (dto.end_date === null) record.end_date = null;

    const saved = await this.agreementRepository.save(record);
    return this.withComputedStatus(saved);
  }

  async addNote(id: string, dto: AddAgreementNoteDto): Promise<Agreement> {
    const record = await this.agreementRepository.findOneBy({ id });
    if (!record || record.deletedAt) throw new NotFoundException(`Agreement ${id} not found`);

    const note: AgreementNote = {
      id: randomUUID(),
      note: dto.note,
      added_by: dto.added_by,
      created_at: new Date().toISOString(),
    };
    record.notes = [...(record.notes ?? []), note];

    const saved = await this.agreementRepository.save(record);
    return this.withComputedStatus(saved);
  }

  /**
   * Soft delete -- un acuerdo tiene valor legal/de cumplimiento, nunca se
   * borra físicamente. Se marca deletedAt/deletedBy y queda excluido de
   * findAll/findOne (ver arriba), pero el registro y su historial
   * (notes, attachments) permanecen intactos en la base de datos para
   * auditoría.
   */
  async remove(id: string, dto: SoftDeleteAgreementDto = {}): Promise<Agreement> {
    const record = await this.agreementRepository.findOneBy({ id });
    if (!record) throw new NotFoundException(`Agreement ${id} not found`);
    if (record.deletedAt) throw new ConflictException(`Agreement ${id} is already archived`);

    record.deletedAt = new Date();
    record.deletedBy = (dto.deleted_by as AgreementPerson) ?? null;

    const saved = await this.agreementRepository.save(record);
    return this.withComputedStatus(saved);
  }

  private today(): string {
    return new Date().toISOString().slice(0, 10);
  }

  /** Agrega un `status` calculado (nunca persistido) a partir de start_date/end_date. */
  private withComputedStatus(record: Agreement): Agreement & { status: AgreementComputedStatus } {
    const today = this.today();
    let status: AgreementComputedStatus = 'active';
    if (record.start_date > today) status = 'upcoming';
    else if (record.end_date && record.end_date < today) status = 'expired';
    return { ...record, status };
  }
}

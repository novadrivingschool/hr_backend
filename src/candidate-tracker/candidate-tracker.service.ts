import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { CandidateTracker } from './entities/candidate-tracker.entity';
import {
  CandidateTrackerStatusHistory,
  CandidateTrackerHistoryField,
} from './entities/candidate-tracker-status-history.entity';
import { CreateCandidateTrackerDto } from './dto/create-candidate-tracker.dto';
import { UpdateCandidateTrackerDto } from './dto/update-candidate-tracker.dto';
import { QueryCandidateTrackerDto } from './dto/query-candidate-tracker.dto';
import { QueryCandidateTrackerHistoryDto } from './dto/query-candidate-tracker-history.dto';
import { CandidateStatusEnum } from './enums';
import { HrUser } from '../common/current-user';
import { deleteCandidateTrackerS3File } from '../common/aws-services.client';

@Injectable()
export class CandidateTrackerService {
  private readonly logger = new Logger(CandidateTrackerService.name);

  constructor(
    @InjectRepository(CandidateTracker)
    private readonly repo: Repository<CandidateTracker>,
    @InjectRepository(CandidateTrackerStatusHistory)
    private readonly historyRepo: Repository<CandidateTrackerStatusHistory>,
  ) {}

  async create(dto: CreateCandidateTrackerDto): Promise<CandidateTracker> {
    const entity = this.repo.create({
      ...dto,
      candidateName: dto.candidateName.trim(),
      status: dto.status ?? CandidateStatusEnum.ToContact,
      attachments: [],
    });
    // Solo se toca si vino en el body: si el caller no manda el campo, se
    // deja que la columna use su default de BD ("+1") en vez de forzar null.
    if (dto.phoneCountryCode !== undefined) {
      entity.phoneCountryCode = this.normalizeCountryCode(dto.phoneCountryCode);
    }
    const saved = await this.repo.save(entity);

    // Historial: todo candidato arranca con un estado, asi que siempre se
    // loguea el status inicial (previousValue null). El result solo si vino
    // seteado desde la creacion (poco comun, pero valido).
    await this.logHistoryChange(
      saved.id,
      'status',
      null,
      saved.status,
      saved.createdByEmployeeNumber ?? null,
      saved.createdByName ?? null,
    );
    if (saved.result) {
      await this.logHistoryChange(
        saved.id,
        'result',
        null,
        saved.result,
        saved.createdByEmployeeNumber ?? null,
        saved.createdByName ?? null,
      );
    }

    return saved;
  }

  async findAll(q: QueryCandidateTrackerDto) {
    const page = Math.max(1, q.page ?? 1);
    const limit = Math.max(1, Math.min(100, q.limit ?? 25));

    const qb = this.repo.createQueryBuilder('ct');
    qb.andWhere('ct.deletedAt IS NULL');

    if (q.search?.trim()) {
      qb.andWhere(
        '(LOWER(ct.candidateName) LIKE :s OR LOWER(ct.email) LIKE :s OR ct.phoneNumber LIKE :s OR LOWER(ct.position) LIKE :s)',
        { s: `%${q.search.trim().toLowerCase()}%` },
      );
    }
    if (q.status) qb.andWhere('ct.status = :status', { status: q.status });
    if (q.result) qb.andWhere('ct.result = :result', { result: q.result });
    if (q.source) qb.andWhere('ct.source = :source', { source: q.source });
    if (q.recruiter?.trim()) {
      qb.andWhere('LOWER(ct.recruiter) = :recruiter', { recruiter: q.recruiter.trim().toLowerCase() });
    }

    qb.orderBy('ct.createdAt', 'DESC').skip((page - 1) * limit).take(limit);

    const [data, total] = await qb.getManyAndCount();

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  async findOne(id: string): Promise<CandidateTracker> {
    const item = await this.repo.findOne({ where: { id } });
    if (!item || item.deletedAt) throw new NotFoundException('Candidate not found');
    return item;
  }

  async update(id: string, dto: UpdateCandidateTrackerDto, user?: HrUser): Promise<CandidateTracker> {
    const item = await this.findOne(id);
    const previousStatus = item.status;
    const previousResult = item.result;

    const patch = { ...dto };
    if (typeof patch.candidateName === 'string') {
      patch.candidateName = patch.candidateName.trim();
    }
    if (patch.phoneCountryCode !== undefined) {
      patch.phoneCountryCode = this.normalizeCountryCode(patch.phoneCountryCode);
    }
    this.repo.merge(item, patch);
    const saved = await this.repo.save(item);

    // Historial: solo se loguea si el valor realmente cambio (no cada PATCH
    // toca status/result -- ej. inline edit de telefono no debe generar
    // entradas de historial).
    const changedByEmployeeNumber = user?.employee_number ?? null;
    const changedByName = user ? `${user.name} ${user.last_name}`.trim() : null;

    if (patch.status !== undefined && patch.status !== previousStatus) {
      await this.logHistoryChange(
        id,
        'status',
        previousStatus ?? null,
        saved.status ?? null,
        changedByEmployeeNumber,
        changedByName,
      );
    }
    if (patch.result !== undefined && patch.result !== previousResult) {
      await this.logHistoryChange(
        id,
        'result',
        previousResult ?? null,
        saved.result ?? null,
        changedByEmployeeNumber,
        changedByName,
      );
    }

    return saved;
  }

  /** Sin catalogo de codigos de pais: texto libre, pero siempre se persiste
   * con "+" adelante sin importar quien llame a la API (UI, Postman, otro
   * servicio). Descarta cualquier letra y tope de 3 digitos (E.164 no
   * define codigos de pais de mas de 3 digitos). "52" -> "+52", "+52" se
   * deja igual, "" o null -> null (usa el default de la columna). */
  private normalizeCountryCode(raw: string | null | undefined): string | null {
    if (raw === undefined || raw === null) return null;
    const digits = raw.replace(/\D/g, '').slice(0, 3);
    return digits ? `+${digits}` : null;
  }

  /**
   * Soft delete -- un candidato archivado sigue siendo informacion de
   * reclutamiento auditable (entrevistas, resultados), asi que nunca se
   * borra fisico ni se le tocan los adjuntos en S3. Solo se marca
   * deletedAt/deletedBy* y queda excluido de findAll/findOne (ver arriba).
   * Mismo patron que AgreementService.remove().
   */
  async remove(id: string, user?: HrUser): Promise<CandidateTracker> {
    const item = await this.findOne(id);
    if (item.deletedAt) throw new ConflictException('Candidate is already archived');

    item.deletedAt = new Date();
    item.deletedByEmployeeNumber = user?.employee_number ?? null;
    item.deletedByName = user ? `${user.name} ${user.last_name}`.trim() : null;

    return this.repo.save(item);
  }

  /** Se llama DESPUES de subir el archivo a aws_services_backend (candidate-tracker/files/upload). */
  async addAttachment(id: string, key: string): Promise<CandidateTracker> {
    const item = await this.findOne(id);
    if (!item.attachments.includes(key)) {
      item.attachments = [...item.attachments, key];
      await this.repo.save(item);
    }
    return item;
  }

  async removeAttachment(id: string, key: string): Promise<CandidateTracker> {
    const item = await this.findOne(id);
    if (item.attachments.includes(key)) {
      item.attachments = item.attachments.filter((k) => k !== key);
      await this.repo.save(item);
      await deleteCandidateTrackerS3File(id, key).catch((err) =>
        this.logger.warn(`No se pudo borrar el adjunto ${key} de S3 para ${id}: ${err?.message ?? err}`),
      );
    }
    return item;
  }
  /** Registra un cambio de status o result en el historial de auditoria.
   * Se llama desde create() (status/result inicial) y update() (solo cuando
   * el valor efectivamente cambio). */
  private async logHistoryChange(
    candidateId: string,
    field: CandidateTrackerHistoryField,
    previousValue: string | null,
    newValue: string | null,
    changedByEmployeeNumber: string | null,
    changedByName: string | null,
  ): Promise<void> {
    const entry = this.historyRepo.create({
      candidateId,
      field,
      previousValue,
      newValue,
      changedByEmployeeNumber,
      changedByName,
    });
    await this.historyRepo.save(entry);
  }

  /** Historial de cambios de status/result, paginado. Sin filtros devuelve
   * todo el historial (mas reciente primero); con candidateId filtra a un
   * solo candidato (usado por el timeline de "Actividad" en el preview). */
  async findHistory(q: QueryCandidateTrackerHistoryDto) {
    const page = Math.max(1, q.page ?? 1);
    const limit = Math.max(1, Math.min(500, q.limit ?? 100));

    const qb = this.historyRepo.createQueryBuilder('h');
    if (q.candidateId) qb.andWhere('h.candidateId = :candidateId', { candidateId: q.candidateId });
    if (q.field) qb.andWhere('h.field = :field', { field: q.field });

    qb.orderBy('h.changedAt', 'DESC').skip((page - 1) * limit).take(limit);

    const [data, total] = await qb.getManyAndCount();

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }
}

import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateChecklistDto } from './dto/create-checklist.dto';
import { UpdateChecklistDto } from './dto/update-checklist.dto';
import { FindOptionsWhere, Repository } from 'typeorm';
import { Checklist } from './entities/checklist.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { DateTime } from 'luxon';

@Injectable()
export class ChecklistService {
  constructor(
    @InjectRepository(Checklist)
    private readonly repo: Repository<Checklist>,
  ) { }
  /** --- Helpers --- */
  private toChicago(dt?: Date | string | null) {
    if (!dt) return null;
    const d = typeof dt === 'string' ? new Date(dt) : dt;
    if (!d || isNaN(d.getTime())) return null;
    const z = DateTime.fromJSDate(d).setZone('America/Chicago');
    return {
      fecha: z.toFormat('yyyy-LL-dd'),
      hora: z.toFormat('hh:mm a').toLowerCase(), // p.ej. "03:41 pm"
    };
  }

  /** Mapea una fila (entity o raw) y le inyecta fecha/hora Chicago */
  private mapWithChicago<T extends any>(row: T): T & { fecha: string | null; hora: string | null } {
    // preferimos updatedAt; fallback createdAt
    const updatedAt = (row as any).updatedAt ?? (row as any).f_updatedAt ?? null;
    const createdAt = (row as any).createdAt ?? (row as any).f_createdAt ?? null;
    const base = updatedAt || createdAt;
    const ch = this.toChicago(base) || { fecha: null, hora: null };

    // devolvemos el objeto original + campos calculados
    return { ...(row as any), fecha: ch.fecha, hora: ch.hora };
  }

  /** --- Endpoints: devuelven SIEMPRE fecha/hora ya formateadas --- */

  async findAll(params?: {
    search?: string;
    location?: string;
    date_from?: string;
    date_to?: string;
    page?: number;
    limit?: number;
  }) {
    const page = Number(params?.page || 1);
    const limit = Math.min(Number(params?.limit || 20), 100);
    const qb = this.repo.createQueryBuilder('f').orderBy('f.updatedAt', 'DESC');

    if (params?.search) {
      qb.andWhere('(LOWER(f.responsable) LIKE :q OR LOWER(f.ubicacion) LIKE :q)', {
        q: `%${params.search.toLowerCase()}%`,
      });
    }
    if (params?.location) {
      qb.andWhere('f.ubicacion = :loc', { loc: params.location });
    }
    if (params?.date_from) {
      qb.andWhere('f.updatedAt >= :from', { from: params.date_from });
    }
    if (params?.date_to) {
      // exclusivo fin de día: agregamos 23:59:59 si solo viene yyyy-mm-dd
      const to = params.date_to.length === 10 ? params.date_to + ' 23:59:59' : params.date_to;
      qb.andWhere('f.updatedAt <= :to', { to });
    }

    qb.skip((page - 1) * limit).take(limit);

    const [rows, total] = await qb.getManyAndCount();
    const mapped = rows.map(r => this.mapWithChicago(r));
    return {
      items: mapped,
      total,
      page,
      limit,
    };
  }

  async findOne(id: string) {
    const row = await this.repo.findOne({ where: { id } as FindOptionsWhere<Checklist> });
    if (!row) throw new NotFoundException('Checklist no encontrado');
    return this.mapWithChicago(row);
  }

  async create(dto: CreateChecklistDto) {
    const entity = this.repo.create(dto as any);
    const saved = await this.repo.save(entity);
    // tras guardar, devolvemos con fecha/hora (America/Chicago)
    return this.mapWithChicago(saved);
  }

  async update(id: string, dto: UpdateChecklistDto) {
    const row = await this.repo.findOne({ where: { id } as FindOptionsWhere<Checklist> });
    if (!row) throw new NotFoundException('Checklist no encontrado');
    const merged = this.repo.merge(row, dto as any);
    const saved = await this.repo.save(merged);
    return this.mapWithChicago(saved);
  }

  async remove(id: string) {
    const row = await this.repo.findOne({ where: { id } as FindOptionsWhere<Checklist> });
    if (!row) throw new NotFoundException('Checklist no encontrado');
    await this.repo.remove(row);
    // Puedes devolver un payload estándar
    return { id, deleted: true };
  }

  /** Si en algún lugar usas RAW queries, mapea igual antes de responder */
  async findAllRawCompat() {
    const rows = await this.repo
      .createQueryBuilder('f')
      .select([
        'f.id AS id',
        'f.responsable AS responsable',
        'f.ubicacion AS ubicacion',
        'f.secciones AS secciones',
        'f._meta AS _meta',
        'f.createdAt AS f_createdAt',
        'f.updatedAt AS f_updatedAt',
      ])
      .orderBy('f.updatedAt', 'DESC')
      .getRawMany();

    return rows.map(r => this.mapWithChicago(r));
  }
}

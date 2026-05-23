import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InvItem } from '../entities/inv_item.entity';
import { CreateItemDto } from '../dto/item/create-item.dto';
import { UpdateItemDto } from '../dto/item/update-item.dto';
import { QueryItemDto } from '../dto/item/query-item.dto';

@Injectable()
export class ItemsService {
  constructor(
    @InjectRepository(InvItem)
    private readonly repo: Repository<InvItem>,
  ) {}

  async create(dto: CreateItemDto): Promise<InvItem> {
    const entity = this.repo.create(dto);
    return await this.repo.save(entity);
  }

  async findAll(q: QueryItemDto) {
    const page = Math.max(1, q.page ?? 1);
    const limit = Math.max(1, Math.min(500, q.limit ?? 100));

    const qb = this.repo.createQueryBuilder('i');

    if (q.search?.trim()) {
      qb.andWhere(
        '(LOWER(i.product_name) LIKE :s OR LOWER(i.sku) LIKE :s OR LOWER(i.serial_number) LIKE :s OR LOWER(i.brand) LIKE :s)',
        { s: `%${q.search.trim().toLowerCase()}%` },
      );
    }

    if (q.warehouse_id) {
      qb.andWhere('i.warehouse_id = :wh', { wh: q.warehouse_id });
    }

    if (q.status === 'active') {
      qb.andWhere('i.is_active = true AND i.baja = false');
    } else if (q.status === 'decommissioned') {
      qb.andWhere('i.baja = true');
    }
    // 'all' — no filter

    qb.orderBy('i.product_name', 'ASC')
      .skip((page - 1) * limit)
      .take(limit);

    const [data, total] = await qb.getManyAndCount();

    // Attach warehouse_name via a single bulk lookup
    const warehouseIds = [...new Set(data.map(i => i.warehouse_id).filter(Boolean))];
    let whNameMap: Record<string, string> = {};
    if (warehouseIds.length) {
      const rows = await this.repo.manager.query(
        `SELECT id, name FROM inv_warehouses WHERE id = ANY($1)`,
        [warehouseIds],
      );
      rows.forEach((r: { id: string; name: string }) => { whNameMap[r.id] = r.name; });
    }

    const enriched = data.map(i => ({
      ...i,
      warehouse_name: whNameMap[i.warehouse_id] ?? null,
    }));

    return { data: enriched, total, page, limit };
  }

  async findOne(id: string): Promise<InvItem> {
    const entity = await this.repo.findOneBy({ id });
    if (!entity) throw new NotFoundException(`Item ${id} not found`);
    return entity;
  }

  async update(id: string, dto: UpdateItemDto): Promise<InvItem> {
    const entity = await this.findOne(id);
    const updated = this.repo.merge(entity, dto);
    return await this.repo.save(updated);
  }

  async remove(id: string): Promise<void> {
    const result = await this.repo.delete(id);
    if (result.affected === 0) throw new NotFoundException(`Item ${id} not found`);
  }
}

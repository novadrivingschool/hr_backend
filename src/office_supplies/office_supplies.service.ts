import { Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { QueryOfficeSupplyDto } from './dto/query-office-supply.dto'
import { CreateOfficeSupplyDto } from './dto/create-office_supply.dto'
import { OfficeSupply } from './entities/office_supply.entity'
import { UpdateOfficeSupplyDto } from './dto/update-office_supply.dto'

function scrubMap(m?: Record<string, any>): Record<string, number> {
  const out: Record<string, number> = {}
  if (!m) return out
  for (const [k, v] of Object.entries(m)) {
    const n = Number(v ?? 0)
    if (Number.isFinite(n) && n > 0) out[k] = n
  }
  return out
}
function countAll(dto: Pick<CreateOfficeSupplyDto, 'office'|'cleaning'|'desk'|'kitchen'>): number {
  const sum = (obj?: Record<string, number>) => Object.values(obj ?? {}).reduce((a, b) => a + (Number(b) || 0), 0)
  return sum(dto.office) + sum(dto.cleaning) + sum(dto.desk) + sum(dto.kitchen)
}

@Injectable()
export class OfficeSuppliesService {
  constructor(
    @InjectRepository(OfficeSupply)
    private readonly repo: Repository<OfficeSupply>,
  ) {}

  async create(dto: CreateOfficeSupplyDto) {
    const cleaned = {
      office: scrubMap(dto.office),
      cleaning: scrubMap(dto.cleaning),
      desk: scrubMap(dto.desk),
      kitchen: scrubMap(dto.kitchen),
    }

    const entity = this.repo.create({
      requestDate: dto.requestDate,
      requester: dto.requester, // ⬅️ VIENE DEL BODY
      requesterEmployeeNumber: dto.requesterEmployeeNumber ?? null,
      location: dto.location,
      ...cleaned,
      otherKitchenItems: dto.otherKitchenItems ?? null,
      observations: dto.observations ?? null,
      itemsCount: countAll(cleaned),
    })

    return this.repo.save(entity)
  }

  async findAll(q: QueryOfficeSupplyDto) {
    const page = Math.max(1, q.page ?? 1)
    const limit = Math.max(1, Math.min(100, q.limit ?? 20))

    const qb = this.repo.createQueryBuilder('os')

    if (q.search?.trim()) {
      qb.andWhere('(LOWER(os.requester) LIKE :s OR LOWER(os.location) LIKE :s)', {
        s: `%${q.search.trim().toLowerCase()}%`,
      })
    }
    if (q.location?.trim()) qb.andWhere('os.location = :loc', { loc: q.location.trim() })
    if (q.date_from) qb.andWhere('os.requestDate >= :df', { df: q.date_from })
    if (q.date_to) qb.andWhere('os.requestDate <= :dt', { dt: q.date_to })

    qb.orderBy('os.updatedAt', 'DESC')
      .addOrderBy('os.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)

    const [data, total] = await qb.getManyAndCount()
    return { data, total, page, limit }
  }

  async findOne(id: string) {
    const item = await this.repo.findOne({ where: { id } })
    if (!item) throw new NotFoundException('OfficeSupply not found')
    return item
  }

  async update(id: string, dto: UpdateOfficeSupplyDto) {
    const item = await this.findOne(id)

    // requester NO se actualiza (aunque venga)
    const patch = {
      requestDate: dto.requestDate ?? item.requestDate,
      location: dto.location ?? item.location,
      office: dto.office ? scrubMap(dto.office) : item.office,
      cleaning: dto.cleaning ? scrubMap(dto.cleaning) : item.cleaning,
      desk: dto.desk ? scrubMap(dto.desk) : item.desk,
      kitchen: dto.kitchen ? scrubMap(dto.kitchen) : item.kitchen,
      otherKitchenItems: dto.otherKitchenItems ?? item.otherKitchenItems,
      observations: dto.observations ?? item.observations,
    }

    const itemsCount = countAll({
      office: patch.office,
      cleaning: patch.cleaning,
      desk: patch.desk,
      kitchen: patch.kitchen,
    })

    await this.repo.update(id, { ...patch, itemsCount })
    return this.findOne(id)
  }

  async remove(id: string) {
    const item = await this.findOne(id)
    await this.repo.remove(item)
    return { ok: true }
  }
}

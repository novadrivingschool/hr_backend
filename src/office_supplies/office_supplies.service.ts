import { Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { QueryOfficeSupplyDto } from './dto/query-office-supply.dto'
import { CreateOfficeSupplyDto } from './dto/create-office_supply.dto'
import { OfficeSupply, SupplyStatus } from './entities/office_supply.entity'
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
function countAll(dto: Pick<CreateOfficeSupplyDto, 'office' | 'cleaning' | 'desk' | 'kitchen'>): number {
  const sum = (obj?: Record<string, number>) => Object.values(obj ?? {}).reduce((a, b) => a + (Number(b) || 0), 0)
  return sum(dto.office) + sum(dto.cleaning) + sum(dto.desk) + sum(dto.kitchen)
}

@Injectable()
export class OfficeSuppliesService {
  constructor(
    @InjectRepository(OfficeSupply)
    private readonly repo: Repository<OfficeSupply>,
  ) { }

  /* async create(dto: CreateOfficeSupplyDto) {
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
  } */
  async create(dto: CreateOfficeSupplyDto) {
    const cleaned = {
      office: scrubMap(dto.office),
      cleaning: scrubMap(dto.cleaning),
      desk: scrubMap(dto.desk),
      kitchen: scrubMap(dto.kitchen),
    }

    const links = this.sanitizeLinks(dto.links) // 👈 NUEVO
    const status =
      (dto.status as SupplyStatus) ?? SupplyStatus.PENDING // 👈 NUEVO (o 'pending' si usas string)

    const entity = this.repo.create({
      requestDate: dto.requestDate,
      requester: dto.requester,
      requesterEmployeeNumber: dto.requesterEmployeeNumber ?? null,
      location: dto.location,
      ...cleaned,
      otherKitchenItems: dto.otherKitchenItems ?? null,
      observations: dto.observations ?? null,
      itemsCount: countAll(cleaned),

      // 👇 NUEVO: se persisten
      status,
      links,
    })

    const saved = await this.repo.save(entity)
    console.log('💾 [OfficeSuppliesService] CREATE saved.links:', saved.links)
    return saved
  }


  sanitizeLinks(arr?: string[]): string[] {
    if (!Array.isArray(arr)) return []
    const out: string[] = []
    const seen = new Set<string>()
    for (const raw of arr) {
      const s = String(raw || '').trim()
      if (!s) continue
      // normaliza: agrega https:// si falta
      const withProto = /^https?:\/\//i.test(s) ? s : `https://${s}`
      try {
        const url = new URL(withProto)
        // valida http/https + TLD simple
        const host = url.hostname.trim()
        const hasTld = /\.[a-z]{2,}$/i.test(host)
        if (!['http:', 'https:'].includes(url.protocol) || !hasTld) continue

        const canon = url.toString()
        const key = canon.toLowerCase()
        if (!seen.has(key)) {
          seen.add(key)
          out.push(canon)
        }
      } catch {
        // ignora inválidos
      }
    }
    return out
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

  /* async update(id: string, dto: UpdateOfficeSupplyDto) {
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
  } */
  async update(id: string, dto: UpdateOfficeSupplyDto) {
    const item = await this.findOne(id)

    const patch = {
      requestDate: dto.requestDate ?? item.requestDate,
      location: dto.location ?? item.location,
      office: dto.office ? scrubMap(dto.office) : item.office,
      cleaning: dto.cleaning ? scrubMap(dto.cleaning) : item.cleaning,
      desk: dto.desk ? scrubMap(dto.desk) : item.desk,
      kitchen: dto.kitchen ? scrubMap(dto.kitchen) : item.kitchen,
      otherKitchenItems: dto.otherKitchenItems ?? item.otherKitchenItems,
      observations: dto.observations ?? item.observations,

      // 👇 NUEVO: si llega status, se actualiza; si no, conserva
      status: (dto.status as SupplyStatus) ?? (item as any).status,

      // 👇 NUEVO: si llega links (aunque vacío), se reemplaza; si no, conserva
      links: Array.isArray(dto.links) ? this.sanitizeLinks(dto.links) : (item as any).links,
    }

    const itemsCount = countAll({
      office: patch.office,
      cleaning: patch.cleaning,
      desk: patch.desk,
      kitchen: patch.kitchen,
    })

    await this.repo.update(id, { ...patch, itemsCount })
    const updated = await this.findOne(id)
    console.log('💾 [OfficeSuppliesService] UPDATE saved.links:', (updated as any).links)
    return updated
  }


  async remove(id: string) {
    const item = await this.findOne(id)
    await this.repo.remove(item)
    return { ok: true }
  }
}

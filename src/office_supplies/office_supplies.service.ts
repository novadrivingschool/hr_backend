import { Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { QueryOfficeSupplyDto } from './dto/query-office-supply.dto'
import { CreateOfficeSupplyDto } from './dto/create-office_supply.dto'
import { OfficeSupply, SupplyStatus } from './entities/office_supply.entity'
import { UpdateOfficeSupplyDto } from './dto/update-office_supply.dto'

/* =========================
 * Zona horaria: America/Chicago (CST/CDT)
 * ========================= */
const CHICAGO_TZ = 'America/Chicago'

/** YYYY-MM-DD en zona Chicago para una fecha dada (o ahora) */
function yyyymmddInChicago(d = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: CHICAGO_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(d)
  const y = parts.find(p => p.type === 'year')!.value
  const m = parts.find(p => p.type === 'month')!.value
  const day = parts.find(p => p.type === 'day')!.value
  return `${y}-${m}-${day}`
}

/** Devuelve el offset "+HH:MM" o "-HH:MM" de Chicago para un instante dado */
function chicagoOffsetFor(date: Date): string {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: CHICAGO_TZ,
    timeZoneName: 'shortOffset',
    year: '2-digit', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false
  })
  const tzName = dtf.formatToParts(date).find(p => p.type === 'timeZoneName')?.value ?? 'GMT-06'
  // Posibles formatos: "GMT-6", "GMT-06", "GMT-05:00"
  const m = tzName.match(/GMT([+\-]\d{1,2})(?::?(\d{2}))?/)
  if (!m) return '-06:00'
  const hh = String(Math.abs(parseInt(m[1], 10))).padStart(2, '0')
  const sign = m[1].startsWith('-') ? '-' : '+'
  const mm = m[2] ?? '00'
  return `${sign}${hh}:${mm}`
}

/**
 * Convierte un YYYY-MM-DD (interpretado en Chicago) a un rango UTC:
 *  [startUTC, endUTC) — útil para filtrar por días sin arrastre de zona.
 */
function chicagoDayToUtcRange(ymd: string): { start: Date, end: Date } {
  // Usamos el offset vigente en ese día (aprox. con mediodía local para salvar cambios de DST)
  const [y, m, d] = ymd.split('-').map(n => parseInt(n, 10))
  const localNoon = new Date(Date.UTC(y, (m - 1), d, 18, 0, 0)) // 12:00 Chicago ~ 18:00 UTC aprox.
  const offset = chicagoOffsetFor(localNoon) // p.ej. "-05:00" o "-06:00"

  const startStr = `${ymd}T00:00:00${offset}`
  // Suma 1 día en calendario (Chicago) para fin exclusivo
  const endDate = new Date(Date.UTC(y, (m - 1), d))
  endDate.setUTCDate(endDate.getUTCDate() + 1)
  const y2 = endDate.getUTCFullYear()
  const m2 = String(endDate.getUTCMonth() + 1).padStart(2, '0')
  const d2 = String(endDate.getUTCDate()).padStart(2, '0')
  const endStr = `${y2}-${m2}-${d2}T00:00:00${offset}`

  return { start: new Date(startStr), end: new Date(endStr) }
}

/** Normaliza un posible YYYY-MM-DD; si es inválido, devuelve hoy (Chicago). */
function normalizeChicagoYMD(maybe: any): string {
  const s = String(maybe ?? '').trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  return yyyymmddInChicago()
}

/* =========================
 * Helpers existentes
 * ========================= */
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

/** Extensiones permitidas: imágenes + pdf */
const ALLOWED_EXT = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'pdf'])

/** Normaliza y valida attachments a: office_supplies/{id}/nombre.ext (keys, no URLs) */
function sanitizeAttachmentsFor(id: string, arr?: string[]): string[] {
  if (!Array.isArray(arr)) return []
  const base = `office_supplies/${id}`
  const out: string[] = []
  const seen = new Set<string>()

  for (let raw of arr) {
    if (typeof raw !== 'string') continue
    raw = raw.trim()
    if (!raw) continue
    if (/^https?:\/\//i.test(raw)) continue // solo keys

    const parts = raw.split('/').filter(Boolean)
    const filename = parts.length ? parts[parts.length - 1] : raw
    if (!filename) continue

    const m = filename.toLowerCase().match(/\.([a-z0-9]+)$/i)
    const ext = m?.[1] || ''
    if (!ALLOWED_EXT.has(ext)) continue

    const key = `${base}/${filename}`.trim()
    if (!seen.has(key)) {
      seen.add(key)
      out.push(key)
    }
  }
  return out
}

function getEmployeeNumber(dto: { employee_number?: any; requesterEmployeeNumber?: any }): string | null {
  const v = (dto as any).employee_number ?? dto.requesterEmployeeNumber
  const s = typeof v === 'string' ? v.trim() : ''
  return s || null
}

@Injectable()
export class OfficeSuppliesService {
  constructor(
    @InjectRepository(OfficeSupply)
    private readonly repo: Repository<OfficeSupply>,
  ) { }

  /* =========================
   * CREATE (normaliza requestDate a Chicago)
   * ========================= */
  async create(dto: CreateOfficeSupplyDto) {
    // requestDate como día de Chicago
    const requestDate = normalizeChicagoYMD((dto as any).requestDate)

    const cleaned = {
      office: scrubMap(dto.office),
      cleaning: scrubMap(dto.cleaning),
      desk: scrubMap(dto.desk),
      kitchen: scrubMap(dto.kitchen),
    }

    const links = this.sanitizeLinks(dto.links)
    const status = (dto.status as SupplyStatus) ?? SupplyStatus.PENDING

    const entity = this.repo.create({
      requestDate, // <-- día en Chicago
      requester: dto.requester,
      employee_number: getEmployeeNumber(dto),
      location: dto.location,
      ...cleaned,
      otherKitchenItems: dto.otherKitchenItems ?? null,
      observations: dto.observations ?? null,
      itemsCount: countAll(cleaned),
      status,
      links,
      notes: typeof (dto as any).notes === 'string' ? (dto as any).notes : null,
      attachments: [],
    })

    const saved = await this.repo.save(entity)
    return saved
  }

  sanitizeLinks(arr?: string[]): string[] {
    if (!Array.isArray(arr)) return []
    const out: string[] = []
    const seen = new Set<string>()
    for (const raw of arr) {
      const s = String(raw || '').trim()
      if (!s) continue
      const withProto = /^https?:\/\//i.test(s) ? s : `https://${s}`
      try {
        const url = new URL(withProto)
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

  /* =========================
   * LIST (filtrado por días interpretados en Chicago)
   * ========================= */
  async findAll(q: QueryOfficeSupplyDto) {
    const page = Math.max(1, q.page ?? 1)
    const limit = Math.max(1, Math.min(100, q.limit ?? 20))

    const qb = this.repo.createQueryBuilder('os')

    if (q.search?.trim()) {
      qb.andWhere('(LOWER(os.requester) LIKE :s OR LOWER(os.location) LIKE :s)', {
        s: `%${q.search.trim().toLowerCase()}%`,
      })
    }
    if (q.location?.trim()) {
      qb.andWhere('os.location = :loc', { loc: q.location.trim() })
    }

    // 🔸 MAPEAMOS string → enum para que sí filtre
    if (q.status) {
      const norm = String(q.status).toLowerCase().trim()
      let st: SupplyStatus | null = null
      if (norm === 'pending') st = SupplyStatus.PENDING
      else if (norm === 'approved') st = SupplyStatus.APPROVED
      else if (['not_approved', 'not approved', 'rejected', 'denied'].includes(norm)) st = SupplyStatus.NOT_APPROVED
      if (st !== null) qb.andWhere('os.status = :st', { st })
    }

    // 🔸 Filtro de fechas por createdAt, interpretando date_from/date_to como días de Chicago
    if (q.date_from || q.date_to) {
      let fromUTC: Date | undefined
      let toUTCExclusive: Date | undefined

      if (q.date_from) {
        const ymd = normalizeChicagoYMD(q.date_from)
        fromUTC = chicagoDayToUtcRange(ymd).start
      }
      if (q.date_to) {
        const ymd = normalizeChicagoYMD(q.date_to)
        toUTCExclusive = chicagoDayToUtcRange(ymd).end // fin exclusivo del día chicago
      }

      if (fromUTC && toUTCExclusive) {
        qb.andWhere('os.createdAt >= :from AND os.createdAt < :to', { from: fromUTC, to: toUTCExclusive })
      } else if (fromUTC) {
        qb.andWhere('os.createdAt >= :from', { from: fromUTC })
      } else if (toUTCExclusive) {
        qb.andWhere('os.createdAt < :to', { to: toUTCExclusive })
      }
    }

    qb.orderBy('os.updatedAt', 'DESC')
      .addOrderBy('os.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)

    const [data, total] = await qb.getManyAndCount()

    return {
      data,
      total,
      page,
      limit,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(total / limit)),
        filters: {
          search: q.search ?? null,
          location: q.location ?? null,
          status: q.status ?? null,
          createdFromChicagoDay: q.date_from ?? null,
          createdToChicagoDay: q.date_to ?? null,
        },
        sort: { by: 'updatedAt,createdAt', dir: 'DESC' }
      }
    }
  }

  async findOne(id: string) {
    const item = await this.repo.findOne({ where: { id } })
    if (!item) throw new NotFoundException('OfficeSupply not found')
    return item
  }

  /* =========================
   * UPDATE (conserva/normaliza requestDate en Chicago)
   * ========================= */
  async update(id: string, dto: UpdateOfficeSupplyDto) {
    const item = await this.findOne(id)

    const patch: Partial<OfficeSupply> = {
      requestDate: dto.requestDate ? normalizeChicagoYMD(dto.requestDate as any) : item.requestDate,
      location: dto.location ?? item.location,
      office: dto.office ? scrubMap(dto.office) : item.office,
      cleaning: dto.cleaning ? scrubMap(dto.cleaning) : item.cleaning,
      desk: dto.desk ? scrubMap(dto.desk) : item.desk,
      kitchen: dto.kitchen ? scrubMap(dto.kitchen) : item.kitchen,
      otherKitchenItems: dto.otherKitchenItems ?? item.otherKitchenItems,
      observations: dto.observations ?? item.observations,

      status: (dto.status as SupplyStatus) ?? (item as any).status,
      links: Array.isArray(dto.links) ? this.sanitizeLinks(dto.links) : (item as any).links,
    }

    if ('notes' in (dto as any)) {
      patch.notes = typeof (dto as any).notes === 'string' ? (dto as any).notes : ''
    } else {
      patch.notes = item.notes
    }

    if (Array.isArray((dto as any).attachments)) {
      patch.attachments = sanitizeAttachmentsFor(id, (dto as any).attachments)
    }

    const itemsCount = countAll({
      office: patch.office,
      cleaning: patch.cleaning,
      desk: patch.desk,
      kitchen: patch.kitchen,
    })

    await this.repo.update(id, { ...patch, itemsCount })
    const updated = await this.findOne(id)
    return updated
  }

  async remove(id: string) {
    const item = await this.findOne(id)
    await this.repo.remove(item)
    return { ok: true }
  }
}

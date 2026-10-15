import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common'
import type { ObjectLiteral, Repository } from 'typeorm'

/**
 * Edición / eliminación puntual de registros de las tablas de upload
 * (instructor/teacher/no-show/assignment payroll). Solo se aceptan las columnas
 * declaradas en el `spec` de cada servicio — id/created_at/updated_at nunca.
 */
export type FieldType = 'string' | 'number' | 'date'
export type EditableSpec = Record<string, { type: FieldType; required?: boolean; max?: number }>

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function assertId(id: string) {
  if (!UUID_RE.test(String(id ?? ''))) throw new BadRequestException('ID inválido')
}

export function sanitizeEdit(body: Record<string, any>, spec: EditableSpec): Record<string, any> {
  const out: Record<string, any> = {}
  for (const [field, rule] of Object.entries(spec)) {
    if (!body || !(field in body)) continue
    const raw = body[field]
    const empty = raw === null || raw === undefined || (typeof raw === 'string' && raw.trim() === '')
    if (empty) {
      if (rule.required) throw new BadRequestException(`El campo ${field} es obligatorio`)
      out[field] = null
      continue
    }
    if (rule.type === 'number') {
      const n = Number(raw)
      if (!Number.isFinite(n)) throw new BadRequestException(`El campo ${field} debe ser numérico`)
      out[field] = n
    } else if (rule.type === 'date') {
      const s = String(raw).trim()
      if (!DATE_RE.test(s) || Number.isNaN(Date.parse(s))) {
        throw new BadRequestException(`El campo ${field} debe tener formato YYYY-MM-DD`)
      }
      out[field] = s
    } else {
      const s = String(raw).trim()
      if (rule.max && s.length > rule.max) {
        throw new BadRequestException(`El campo ${field} excede ${rule.max} caracteres`)
      }
      out[field] = s
    }
  }
  if (!Object.keys(out).length) throw new BadRequestException('No hay campos válidos para actualizar')
  return out
}

export async function updateRecord<T extends ObjectLiteral>(
  repo: Repository<T>,
  id: string,
  body: Record<string, any>,
  spec: EditableSpec,
): Promise<T> {
  assertId(id)
  const patch = sanitizeEdit(body, spec)
  const existing = await repo.findOne({ where: { id } as any })
  if (!existing) throw new NotFoundException('Registro no encontrado')
  Object.assign(existing, patch)
  try {
    return await repo.save(existing)
  } catch (e: any) {
    if (e?.code === '23505') {
      throw new ConflictException('Ya existe otro registro con esos mismos datos (llave duplicada)')
    }
    throw e
  }
}

export async function deleteRecord<T extends ObjectLiteral>(repo: Repository<T>, id: string): Promise<{ ok: true }> {
  assertId(id)
  const res = await repo.delete(id)
  if (!res.affected) throw new NotFoundException('Registro no encontrado')
  return { ok: true }
}

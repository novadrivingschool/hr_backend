import { BadRequestException } from '@nestjs/common'
import type { Worksheet } from 'exceljs'

/**
 * Validación explícita de filas en los uploads de Excel (instructor / teacher /
 * no-show / assignment). Acumula TODOS los problemas del archivo y al final lanza un
 * resultado estructurado: qué fila, qué campo, qué valor y por qué. Las filas válidas
 * SÍ se importan; solo las que fallan se devuelven (`validation`). El front las muestra
 * en un dialog, deja corregirlas y reintenta SOLO esas filas (`corrections` + `only_rows`).
 *
 * Estándar de fechas de los uploads: MM/DD/YYYY.
 */
export const DATE_FORMAT_HINT = 'MM/DD/YYYY, ej. 09/24/2026'
export const UPLOAD_VALIDATION_CODE = 'UPLOAD_VALIDATION'
const MAX_FAILED_ROWS = 500

export function isRealIsoDate(iso: string): boolean {
  const m = String(iso ?? '').match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return false
  const y = +m[1], mo = +m[2], d = +m[3]
  const dt = new Date(Date.UTC(y, mo - 1, d))
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d
}

// ── Correcciones enviadas por el front al reintentar ─────────────────────────
export interface UploadCorrection { row: number; col: number; value: string }

export function parseCorrections(raw: unknown): UploadCorrection[] {
  if (raw === undefined || raw === null || raw === '') return []
  let arr: any
  try {
    arr = typeof raw === 'string' ? JSON.parse(raw) : raw
  } catch {
    throw new BadRequestException('El campo "corrections" no es un JSON válido')
  }
  if (!Array.isArray(arr) || arr.length > 20000) {
    throw new BadRequestException('El campo "corrections" debe ser una lista (máx. 20,000)')
  }
  return arr.map((c: any, idx: number) => {
    const row = Number(c?.row), col = Number(c?.col)
    if (!Number.isInteger(row) || row < 2 || row > 1048576 || !Number.isInteger(col) || col < 1 || col > 200) {
      throw new BadRequestException(`Corrección #${idx + 1} inválida (fila/columna fuera de rango)`)
    }
    return { row, col, value: String(c?.value ?? '').trim().slice(0, 500) }
  })
}

/** Aplica las correcciones sobre la hoja ya cargada, antes de parsear. */
export function applyCorrections(sheet: Worksheet, corrections: UploadCorrection[]): void {
  for (const c of corrections) {
    sheet.getRow(c.row).getCell(c.col).value = c.value
  }
}

// ── Validador ────────────────────────────────────────────────────────────────
export interface UploadIssue {
  field: string
  col: number | null
  value: string
  type: 'missing' | 'invalid_date'
  reason: string
}
interface FailedRow { row: number; context: string; issues: UploadIssue[] }

export class UploadValidator {
  private rows = new Map<number, FailedRow>()
  private contexts = new Map<number, string>()

  /** Texto para identificar el registro en el dialog (ej. "Alumno · Instructor"). */
  context(row: number, text: string): void {
    this.contexts.set(row, text)
  }

  private add(row: number, issue: UploadIssue) {
    const cur = this.rows.get(row) ?? { row, context: this.contexts.get(row) ?? '', issues: [] }
    cur.issues.push(issue)
    this.rows.set(row, cur)
  }

  /** Campo obligatorio vacío. */
  required(column: string, value: string | null | undefined, row: number, col: number | null = null): void {
    if (String(value ?? '').trim()) return
    this.add(row, { field: column, col, value: '', type: 'missing', reason: 'Campo obligatorio vacío' })
  }

  /**
   * Fecha obligatoria. `raw` = texto tal cual venía en la celda; `parsed` = ISO
   * (YYYY-MM-DD) que obtuvo el parser, o ''/null si no la reconoció.
   */
  date(column: string, raw: string | null | undefined, parsed: string | null | undefined, row: number, col: number | null = null): void {
    const r = String(raw ?? '').trim()
    if (!r) return this.required(column, '', row, col)
    if (parsed && isRealIsoDate(parsed)) return
    this.add(row, {
      field: column, col, value: r, type: 'invalid_date',
      reason: `No es una fecha válida. Formato esperado: ${DATE_FORMAT_HINT}`,
    })
  }

  rowFailed(row: number): boolean {
    return this.rows.has(row)
  }

  /** Filas que fallaron (para devolverlas al front junto con el resultado de lo que sí se importó). */
  result(): UploadValidationInfo | undefined {
    if (!this.rows.size) return undefined
    const failed = Array.from(this.rows.values()).sort((a, b) => a.row - b.row)
    return {
      total_failed: failed.length,
      truncated: failed.length > MAX_FAILED_ROWS,
      failed_rows: failed.slice(0, MAX_FAILED_ROWS),
    }
  }
}

export interface UploadValidationInfo {
  total_failed: number
  truncated: boolean
  failed_rows: FailedRow[]
}

/** Números de fila (del Excel) que se deben procesar en un reintento; vacío = todo el archivo. */
export function parseOnlyRows(raw: unknown): number[] {
  if (raw === undefined || raw === null || raw === '') return []
  let arr: any
  try {
    arr = typeof raw === 'string' ? JSON.parse(raw) : raw
  } catch {
    throw new BadRequestException('El campo "only_rows" no es un JSON válido')
  }
  if (!Array.isArray(arr) || arr.length > 20000) {
    throw new BadRequestException('El campo "only_rows" debe ser una lista (máx. 20,000)')
  }
  return arr.map((n: any) => {
    const row = Number(n)
    if (!Number.isInteger(row) || row < 2 || row > 1048576) throw new BadRequestException('only_rows contiene una fila inválida')
    return row
  })
}

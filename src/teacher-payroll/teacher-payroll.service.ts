import { Injectable, BadRequestException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository, Between } from 'typeorm'
import * as ExcelJS from 'exceljs'
import { TeacherPayroll } from './entities/teacher-payroll.entity'

@Injectable()
export class TeacherPayrollService {
  constructor(
    @InjectRepository(TeacherPayroll)
    private readonly repo: Repository<TeacherPayroll>,
  ) {}

  // ── Upload & upsert ────────────────────────────────────────────────────────

  async uploadExcel(buffer: Buffer): Promise<{ inserted: number; updated: number; skipped: number }> {
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(buffer)

    const sheet = workbook.worksheets[0]
    if (!sheet) throw new BadRequestException('El archivo Excel no tiene hojas')

    const headerRow = sheet.getRow(1)
    const headers: Record<string, number> = {}
    headerRow.eachCell((cell, col) => {
      const key = String(cell.value ?? '').trim().toLowerCase()
      headers[key] = col
    })

    const col = (names: string[]): number | null => {
      for (const n of names) if (headers[n] !== undefined) return headers[n]
      return null
    }

    const colTeacher    = col(['teacher'])
    const colCrNum      = col(['cr #', 'cr#', 'cr number'])
    const colCrProduct  = col(['type of cr product', 'cr product'])
    const colDate       = col(['session date', 'date'])
    const colStartTime  = col(['session start time', 'start time'])
    const colEndTime    = col(['session end time', 'end time'])
    const colLocation   = col(['location'])
    const colSessionNum = col(['session #', 'session number'])
    const colStatus     = col(['cr status', 'status'])
    const colHours      = col(['number of hours', 'hours'])

    if (!colTeacher || !colDate) {
      throw new BadRequestException('Columnas requeridas no encontradas: Teacher, Session Date')
    }

    const EXCEL_ZERO_DATE = '1899-12-30'

    const getCellDate = (row: ExcelJS.Row, colIdx: number | null): string => {
      if (!colIdx) return ''
      const cell = row.getCell(colIdx)
      if (cell.value === null || cell.value === undefined) return ''
      if (cell.value instanceof Date) {
        const mo  = cell.value.getUTCMonth() + 1
        const dy  = cell.value.getUTCDate()
        const yr  = cell.value.getUTCFullYear()
        const [finalMo, finalDy] = (dy <= 12 && mo <= 12) ? [dy, mo] : [mo, dy]
        const iso = `${yr}-${String(finalMo).padStart(2,'0')}-${String(finalDy).padStart(2,'0')}`
        return iso === EXCEL_ZERO_DATE ? '' : iso
      }
      const str = String(cell.value).trim()
      if (!str || str === EXCEL_ZERO_DATE) return ''
      const m = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
      if (m) return `${m[3]}-${m[1].padStart(2,'0')}-${m[2].padStart(2,'0')}`
      if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str
      return ''
    }

    const getCellValue = (row: ExcelJS.Row, colIdx: number | null): string => {
      if (!colIdx) return ''
      const cell = row.getCell(colIdx)
      if (cell.value === null || cell.value === undefined) return ''
      if (cell.value instanceof Date) {
        const iso = cell.value.toISOString().split('T')[0]
        return iso === EXCEL_ZERO_DATE ? '' : iso
      }
      if (typeof cell.value === 'object' && 'richText' in (cell.value as any)) {
        return (cell.value as any).richText.map((r: any) => r.text).join('')
      }
      const str = String(cell.value).trim()
      return str === EXCEL_ZERO_DATE ? '' : str
    }

    const getCellTimeValue = (row: ExcelJS.Row, colIdx: number | null): string => {
      if (!colIdx) return ''
      const cell = row.getCell(colIdx)
      if (cell.value === null || cell.value === undefined) return ''
      if (cell.value instanceof Date) {
        const h = cell.value.getUTCHours().toString().padStart(2, '0')
        const m = cell.value.getUTCMinutes().toString().padStart(2, '0')
        return `${h}:${m}`
      }
      if (typeof cell.value === 'object' && 'richText' in (cell.value as any)) {
        return (cell.value as any).richText.map((r: any) => r.text).join('')
      }
      return String(cell.value).trim()
    }

    const parseDate = (raw: string): string | null => {
      if (!raw) return null
      const parts = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
      if (parts) return `${parts[3]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`
      if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw
      return null
    }

    const parseNumber = (raw: string): number | null => {
      const n = parseFloat(raw.replace(/[^0-9.-]/g, ''))
      return isNaN(n) ? null : n
    }

    // ── 1. Parse all rows in memory ──────────────────────────────────────────
    const payloads: Partial<TeacherPayroll>[] = []
    let skipped = 0

    for (let i = 2; i <= sheet.rowCount; i++) {
      const row     = sheet.getRow(i)
      const teacher     = getCellValue(row, colTeacher).trim()
      const sessionDate = getCellDate(row, colDate)

      if (!teacher && !sessionDate) continue // fila vacía
      if (!teacher || !sessionDate) { skipped++; continue }

      const crNumber = getCellValue(row, colCrNum) || null

      payloads.push({
        teacher,
        cr_number:          crNumber,
        type_of_cr_product: getCellValue(row, colCrProduct) || null,
        session_date:       sessionDate,
        session_start_time: getCellTimeValue(row, colStartTime) || null,
        session_end_time:   getCellTimeValue(row, colEndTime) || null,
        location:           getCellValue(row, colLocation) || null,
        session_number:     getCellValue(row, colSessionNum) || null,
        cr_status:          getCellValue(row, colStatus) || null,
        number_of_hours:    parseNumber(getCellValue(row, colHours)),
      })
    }

    if (payloads.length === 0) return { inserted: 0, updated: 0, skipped }

    // ── 2. Composite key helper ──────────────────────────────────────────────
    const rowKey = (t: string, d: string, s: string | null | undefined, cr: string | null | undefined) =>
      `${t}|${d}|${s ?? ''}|${cr ?? ''}`

    // ── 3. Deduplicate rows within the file ──────────────────────────────────
    const dedupMap = new Map<string, Partial<TeacherPayroll>>()
    for (const p of payloads) {
      dedupMap.set(rowKey(p.teacher!, p.session_date!, p.session_start_time, p.cr_number), p)
    }
    const uniquePayloads = Array.from(dedupMap.values())

    // ── 4. Fetch existing records in date range ──────────────────────────────
    const dates   = uniquePayloads.map(p => p.session_date!).sort()
    const minDate = dates[0]
    const maxDate = dates[dates.length - 1]

    const existingRows = await this.repo.find({
      where: { session_date: Between(minDate, maxDate) },
      select: ['id', 'teacher', 'session_date', 'session_start_time', 'cr_number'],
    })

    const existingMap = new Map<string, string>()
    for (const r of existingRows) {
      existingMap.set(rowKey(r.teacher, r.session_date, r.session_start_time, r.cr_number), r.id)
    }

    // ── 5. Split inserts / updates ───────────────────────────────────────────
    const toInsert: Partial<TeacherPayroll>[] = []
    const toUpdate: Partial<TeacherPayroll>[] = []

    for (const p of uniquePayloads) {
      const existingId = existingMap.get(rowKey(p.teacher!, p.session_date!, p.session_start_time, p.cr_number))
      if (existingId) toUpdate.push({ id: existingId, ...p })
      else            toInsert.push(p)
    }

    // ── 6. Bulk save in chunks ───────────────────────────────────────────────
    const CHUNK = 200
    for (let i = 0; i < toInsert.length; i += CHUNK) {
      await this.repo.save(toInsert.slice(i, i + CHUNK).map(p => this.repo.create(p)))
    }
    for (let i = 0; i < toUpdate.length; i += CHUNK) {
      await this.repo.save(toUpdate.slice(i, i + CHUNK) as TeacherPayroll[])
    }

    return { inserted: toInsert.length, updated: toUpdate.length, skipped }
  }

  // ── Query ──────────────────────────────────────────────────────────────────

  async findAll(filters: {
    start_date?: string
    end_date?: string
    teacher?: string
    status?: string
    page?: number
    limit?: number
  }) {
    const { start_date, end_date, teacher, status, page = 1, limit = 100 } = filters

    const qb = this.repo
      .createQueryBuilder('tp')
      .orderBy('tp.session_date', 'DESC')
      .addOrderBy('tp.session_start_time', 'ASC')

    if (start_date) qb.andWhere('tp.session_date >= :start_date', { start_date })
    if (end_date)   qb.andWhere('tp.session_date <= :end_date', { end_date })
    if (teacher)    qb.andWhere('tp.teacher ILIKE :teacher', { teacher: `%${teacher}%` })
    if (status)     qb.andWhere('tp.cr_status ILIKE :status', { status: `%${status}%` })

    qb.skip((page - 1) * limit).take(limit)

    const [data, total] = await qb.getManyAndCount()
    return { total, page, limit, data }
  }
}

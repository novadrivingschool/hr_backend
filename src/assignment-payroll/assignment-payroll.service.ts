import { Injectable, BadRequestException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository, Between } from 'typeorm'
import * as ExcelJS from 'exceljs'
import { AssignmentPayroll } from './entities/assignment-payroll.entity'

@Injectable()
export class AssignmentPayrollService {
  constructor(
    @InjectRepository(AssignmentPayroll)
    private readonly repo: Repository<AssignmentPayroll>,
  ) {}

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

    const colStudentName = col(['student name'])
    const colType        = col(['type'])
    const colPackage     = col(['package'])
    const colDate        = col(['date of btw', 'date'])
    const colStartTime   = col(['btw start time', 'start time'])
    const colEndTime     = col(['btw end time', 'end time'])
    const colHours       = col(['number of hours', 'hours'])
    const colInstructor  = col(['instructor'])
    const colStatus      = col(['status'])
    const colLocation    = col(['location'])
    const colNotes       = col(['student notes', 'notes'])
    const colAssigned    = col(['assigned'])

    if (!colStudentName || !colDate || !colInstructor) {
      throw new BadRequestException(
        'Columnas requeridas no encontradas: Student Name, Date of BTW, Instructor',
      )
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
      // Formula cell: extract result
      if (typeof cell.value === 'object' && 'result' in (cell.value as any)) {
        const result = (cell.value as any).result
        if (result == null) return ''
        if (result instanceof Date) return result.toISOString().split('T')[0]
        return String(result).trim()
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
      // Replace comma decimal separator (European locale: "1,5" → "1.5")
      const n = parseFloat(raw.replace(',', '.').replace(/[^0-9.-]/g, ''))
      return isNaN(n) ? null : n
    }

    // ── 1. Parse all rows ───────────────────────────────────────────────────
    const payloads: Partial<AssignmentPayroll>[] = []
    let skipped = 0

    for (let i = 2; i <= sheet.rowCount; i++) {
      const row        = sheet.getRow(i)
      const studentName = getCellValue(row, colStudentName).trim()
      const dateOfBtw   = getCellDate(row, colDate)
      const instructor  = getCellValue(row, colInstructor).trim()

      if (!studentName && !dateOfBtw && !instructor) continue // fila vacía
      if (!studentName || !dateOfBtw || !instructor) { skipped++; continue }

      payloads.push({
        student_name:  studentName,
        type:          getCellValue(row, colType) || null,
        package:       getCellValue(row, colPackage) || null,
        date_of_btw:   dateOfBtw,
        btw_start_time: getCellTimeValue(row, colStartTime) || null,
        btw_end_time:  getCellTimeValue(row, colEndTime) || null,
        number_of_hours: parseNumber(getCellValue(row, colHours)),
        instructor,
        status:        getCellValue(row, colStatus) || null,
        location:      getCellValue(row, colLocation) || null,
        student_notes: getCellValue(row, colNotes) || null,
        assigned:      getCellValue(row, colAssigned) || null,
      })
    }

    if (payloads.length === 0) return { inserted: 0, updated: 0, skipped }

    const rowKey = (s: string, d: string, t: string | null | undefined, ins: string) =>
      `${s}|${d}|${t ?? ''}|${ins}`

    // ── 2. Dedup within file ────────────────────────────────────────────────
    const dedupMap = new Map<string, Partial<AssignmentPayroll>>()
    for (const p of payloads) {
      dedupMap.set(rowKey(p.student_name!, p.date_of_btw!, p.btw_start_time, p.instructor!), p)
    }
    const uniquePayloads = Array.from(dedupMap.values())

    // ── 3. Fetch existing in date range ────────────────────────────────────
    const dates   = uniquePayloads.map(p => p.date_of_btw!).sort()
    const minDate = dates[0]
    const maxDate = dates[dates.length - 1]

    const existingRows = await this.repo.find({
      where: { date_of_btw: Between(minDate, maxDate) },
      select: ['id', 'student_name', 'date_of_btw', 'btw_start_time', 'instructor'],
    })

    const existingMap = new Map<string, string>()
    for (const r of existingRows) {
      existingMap.set(rowKey(r.student_name, r.date_of_btw, r.btw_start_time, r.instructor), r.id)
    }

    // ── 4. Split inserts / updates ─────────────────────────────────────────
    const toInsert: Partial<AssignmentPayroll>[] = []
    const toUpdate: Partial<AssignmentPayroll>[] = []

    for (const p of uniquePayloads) {
      const existingId = existingMap.get(rowKey(p.student_name!, p.date_of_btw!, p.btw_start_time, p.instructor!))
      if (existingId) toUpdate.push({ id: existingId, ...p })
      else            toInsert.push(p)
    }

    // ── 5. Bulk save in chunks ─────────────────────────────────────────────
    const CHUNK = 200
    for (let i = 0; i < toInsert.length; i += CHUNK) {
      await this.repo.save(toInsert.slice(i, i + CHUNK).map(p => this.repo.create(p)))
    }
    for (let i = 0; i < toUpdate.length; i += CHUNK) {
      await this.repo.save(toUpdate.slice(i, i + CHUNK) as AssignmentPayroll[])
    }

    return { inserted: toInsert.length, updated: toUpdate.length, skipped }
  }

  async findAll(filters: {
    start_date?: string
    end_date?: string
    instructor?: string
    status?: string
    page?: number
    limit?: number
  }) {
    const { start_date, end_date, instructor, status, page = 1, limit = 100 } = filters

    const qb = this.repo
      .createQueryBuilder('ap')
      .orderBy('ap.date_of_btw', 'DESC')
      .addOrderBy('ap.btw_start_time', 'ASC')

    if (start_date) qb.andWhere('ap.date_of_btw >= :start_date', { start_date })
    if (end_date)   qb.andWhere('ap.date_of_btw <= :end_date', { end_date })
    if (instructor) qb.andWhere('ap.instructor ILIKE :instructor', { instructor: `%${instructor}%` })
    if (status)     qb.andWhere('ap.status ILIKE :status', { status: `%${status}%` })

    qb.skip((page - 1) * limit).take(limit)

    const [data, total] = await qb.getManyAndCount()
    return { total, page, limit, data }
  }
}

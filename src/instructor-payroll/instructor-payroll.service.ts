import { Injectable, BadRequestException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository, Between } from 'typeorm'
import * as ExcelJS from 'exceljs'
import { InstructorPayroll } from './entities/instructor-payroll.entity'

@Injectable()
export class InstructorPayrollService {
  constructor(
    @InjectRepository(InstructorPayroll)
    private readonly repo: Repository<InstructorPayroll>,
  ) {}

  // ── Upload & upsert ────────────────────────────────────────────────────────

  async uploadExcel(buffer: Buffer): Promise<{ inserted: number; updated: number; skipped: number; duplicates_in_file: number }> {
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(buffer)

    const sheet = workbook.worksheets[0]
    if (!sheet) throw new BadRequestException('El archivo Excel no tiene hojas')

    // Build header map from first row
    const headerRow = sheet.getRow(1)
    const headers: Record<string, number> = {}
    headerRow.eachCell((cell, col) => {
      const key = String(cell.value ?? '').trim().toLowerCase()
      headers[key] = col
    })

    const col = (names: string[]): number | null => {
      for (const n of names) {
        if (headers[n] !== undefined) return headers[n]
      }
      return null
    }

    const colStudentName    = col(['student name'])
    const colPhone          = col(['student phone number', 'phone', 'phone number'])
    const colType           = col(['type'])
    const colPackage        = col(['package'])
    const colDate           = col(['date of btw', 'date'])
    const colStartTime      = col(['btw start time', 'start time'])
    const colEndTime        = col(['btw end time', 'end time'])
    const colHours          = col(['number of hours', 'hours'])
    const colInstructor     = col(['instructor'])
    const colStatus         = col(['status'])
    const colLocation       = col(['location'])
    const colFee            = col(['fee applied', 'fee'])
    const colNotes          = col(['student notes', 'notes'])

    if (!colStudentName || !colDate || !colInstructor) {
      throw new BadRequestException(
        'Columnas requeridas no encontradas: Student Name, Date of BTW, Instructor',
      )
    }

    const EXCEL_ZERO_DATE = '1899-12-30' // Excel serial 0 — treat as empty

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

    // Times in Excel are stored as Date fractions (base 1899-12-30).
    // We extract HH:MM from the time component, not the date.
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
      // MM/DD/YYYY or YYYY-MM-DD
      const parts = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
      if (parts) return `${parts[3]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`
      if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw
      return null
    }

    const parseNumber = (raw: string): number | null => {
      const n = parseFloat(raw.replace(/[^0-9.-]/g, ''))
      return isNaN(n) ? null : n
    }

    // ── 1. Parse ALL rows in memory (zero DB calls) ──────────────────────────
    const payloads: Partial<InstructorPayroll>[] = []
    let skipped = 0

    for (let i = 2; i <= sheet.rowCount; i++) {
      const row         = sheet.getRow(i)
      const studentName = getCellValue(row, colStudentName).trim()
      const rawDate     = getCellValue(row, colDate).trim()
      const instructor  = getCellValue(row, colInstructor).trim()

      if (!studentName && !rawDate && !instructor) continue // fila vacía, no contar
      if (!studentName || !rawDate || !instructor) {
        console.warn(`[InstructorPayroll] Fila ${i} OMITIDA (campos vacíos) → student="${studentName}" date="${rawDate}" instructor="${instructor}"`)
        skipped++; continue
      }

      const dateOfBtw = parseDate(rawDate)
      if (!dateOfBtw) {
        console.warn(`[InstructorPayroll] Fila ${i} OMITIDA (fecha inválida) → student="${studentName}" rawDate="${rawDate}" instructor="${instructor}"`)
        skipped++; continue
      }

      payloads.push({
        student_name:         studentName,
        student_phone_number: getCellValue(row, colPhone) || null,
        type:                 getCellValue(row, colType) || null,
        package:              getCellValue(row, colPackage) || null,
        date_of_btw:          dateOfBtw,
        btw_start_time:       getCellTimeValue(row, colStartTime) || null,
        btw_end_time:         getCellTimeValue(row, colEndTime) || null,
        number_of_hours:      parseNumber(getCellValue(row, colHours)),
        instructor,
        status:               getCellValue(row, colStatus) || null,
        location:             getCellValue(row, colLocation) || null,
        fee_applied:          parseNumber(getCellValue(row, colFee)),
        student_notes:        getCellValue(row, colNotes) || null,
      })
    }

    if (payloads.length === 0) return { inserted: 0, updated: 0, skipped, duplicates_in_file: 0 }

    // ── 2. Composite key helper ──────────────────────────────────────────────
    const rowKey = (s: string, d: string, t: string | null | undefined, ins: string, st: string | null | undefined) =>
      `${s}|${d}|${t ?? ''}|${ins}|${(st ?? '').toLowerCase()}`

    // ── 3. Deduplicate rows within the file (last occurrence wins) ────────────
    const dedupMap = new Map<string, Partial<InstructorPayroll>>()
    for (const p of payloads) {
      const k = rowKey(p.student_name!, p.date_of_btw!, p.btw_start_time, p.instructor!, p.status)
      if (dedupMap.has(k)) {
        console.warn(`[InstructorPayroll] DUPLICADO en archivo → student="${p.student_name}" date="${p.date_of_btw}" start="${p.btw_start_time}" instructor="${p.instructor}" status="${p.status}"`)
      }
      dedupMap.set(k, p)
    }
    const uniquePayloads = Array.from(dedupMap.values())
    const duplicates_in_file = payloads.length - uniquePayloads.length
    if (duplicates_in_file > 0) console.warn(`[InstructorPayroll] Total duplicados en archivo: ${duplicates_in_file}`)
    console.log(`[InstructorPayroll] Resumen parse → total filas data: ${payloads.length + skipped}, válidas: ${payloads.length}, skipped: ${skipped}, duplicados: ${duplicates_in_file}, a guardar: ${uniquePayloads.length}`)

    // ── 4. One query to fetch existing records in the date range ──────────────
    const dates    = uniquePayloads.map(p => p.date_of_btw!).sort()
    const minDate  = dates[0]
    const maxDate  = dates[dates.length - 1]

    const existingRows = await this.repo.find({
      where: { date_of_btw: Between(minDate, maxDate) },
      select: ['id', 'student_name', 'date_of_btw', 'btw_start_time', 'instructor', 'status'],
    })

    const existingMap = new Map<string, string>() // key → id
    for (const r of existingRows) {
      existingMap.set(rowKey(r.student_name, r.date_of_btw, r.btw_start_time, r.instructor, r.status), r.id)
    }

    // ── 5. Split into inserts and updates ─────────────────────────────────────
    const toInsert: Partial<InstructorPayroll>[] = []
    const toUpdate: Partial<InstructorPayroll>[] = []

    for (const p of uniquePayloads) {
      const existingId = existingMap.get(rowKey(p.student_name!, p.date_of_btw!, p.btw_start_time, p.instructor!, p.status))
      if (existingId) {
        toUpdate.push({ id: existingId, ...p })
      } else {
        toInsert.push(p)
      }
    }

    // ── 6. Bulk save in chunks of 200 ─────────────────────────────────────────
    const CHUNK = 200
    for (let i = 0; i < toInsert.length; i += CHUNK) {
      await this.repo.save(toInsert.slice(i, i + CHUNK).map(p => this.repo.create(p)))
    }
    for (let i = 0; i < toUpdate.length; i += CHUNK) {
      await this.repo.save(toUpdate.slice(i, i + CHUNK) as InstructorPayroll[])
    }

    return { inserted: toInsert.length, updated: toUpdate.length, skipped, duplicates_in_file }
  }

  // ── Query ──────────────────────────────────────────────────────────────────

  async findAll(filters: {
    start_date?: string
    end_date?: string
    instructor?: string
    status?: string
    page?: number
    limit?: number
  }) {
    const { start_date, end_date, instructor, status, page = 1, limit = 100 } = filters

    const qb = this.repo.createQueryBuilder('ip').orderBy('ip.date_of_btw', 'DESC').addOrderBy('ip.btw_start_time', 'ASC')

    if (start_date) qb.andWhere('ip.date_of_btw >= :start_date', { start_date })
    if (end_date)   qb.andWhere('ip.date_of_btw <= :end_date', { end_date })
    if (instructor) qb.andWhere('ip.instructor ILIKE :instructor', { instructor: `%${instructor}%` })
    if (status)     qb.andWhere('ip.status ILIKE :status', { status: `%${status}%` })

    qb.skip((page - 1) * limit).take(limit)

    const [data, total] = await qb.getManyAndCount()
    return { total, page, limit, data }
  }
}

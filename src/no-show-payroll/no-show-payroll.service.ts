import { Injectable, BadRequestException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository, Between } from 'typeorm'
import * as ExcelJS from 'exceljs'
import { NoShowPayroll } from './entities/no-show-payroll.entity'

@Injectable()
export class NoShowPayrollService {
  constructor(
    @InjectRepository(NoShowPayroll)
    private readonly repo: Repository<NoShowPayroll>,
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

    const colStudentName     = col(['student name'])
    const colDate            = col(['date of btw', 'date'])
    const colProduct         = col(['btw product'])
    const colHours           = col(['number of hours', 'hours'])
    const colStatus          = col(['status'])
    const colInstructor      = col(['instructor'])
    const colLocation        = col(['location'])
    const colStartTime       = col(['btw start time', 'start time'])
    const colEndTime         = col(['btw end time', 'end time'])
    const colLcVia           = col(['late cancellation via'])
    const colLoggedUser      = col(['logged in user for late cancellation'])
    const colApptId          = col(['appt id'])
    const colStudentId       = col(['student id'])
    const colStudentCell     = col(['student cell'])
    const colBalance         = col(['account balance'])
    const colPackage         = col(['service (package)', 'service'])
    const colComponentType   = col(['component type'])
    const colApptDatetime    = col(['appointment full date and time'])
    const colStudentNotes    = col(['student notes'])
    const colApptNotes       = col(['appointment notes'])

    if (!colStudentName || !colDate || !colInstructor) {
      throw new BadRequestException(
        'Columnas requeridas no encontradas: Student Name, Date of BTW, Instructor',
      )
    }

    const EXCEL_ZERO_DATE = '1899-12-30'

    // Dedicated date reader: corrects DD/MM locale stored in Excel serials.
    // When both month and day ≤ 12 the Excel serial was built with DD/MM order → swap.
    // When day > 12 Excel couldn't interpret as DD/MM so it used MM/DD → keep as-is.
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
      // String fallback: parse as MM/DD/YYYY
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
      // Replace comma decimal separator (European locale: "1,5" → "1.5")
      const n = parseFloat(raw.replace(',', '.').replace(/[^0-9.-]/g, ''))
      return isNaN(n) ? null : n
    }

    const calcPaidHours = (hours: number | null): number | null => {
      if (hours === null) return null
      if (hours >= 4)   return 3
      if (hours >= 3)   return 1.5
      if (hours >= 2)   return 1.5
      if (hours >= 1.5) return 1
      if (hours >= 1)   return 0.5
      return 0
    }

    // ── 1. Parse all rows ───────────────────────────────────────────────────
    const payloads: Partial<NoShowPayroll>[] = []
    let skipped = 0

    for (let i = 2; i <= sheet.rowCount; i++) {
      const row         = sheet.getRow(i)
      const studentName = getCellValue(row, colStudentName).trim()
      const dateOfBtw   = getCellDate(row, colDate)
      const instructor  = getCellValue(row, colInstructor).trim()

      if (!studentName && !dateOfBtw && !instructor) continue // fila vacía
      if (!studentName || !dateOfBtw || !instructor) { skipped++; continue }

      payloads.push({
        student_name:             studentName,
        date_of_btw:              dateOfBtw,
        btw_product:              getCellValue(row, colProduct) || null,
        number_of_hours:          parseNumber(getCellValue(row, colHours)),
        paid_hours:               calcPaidHours(parseNumber(getCellValue(row, colHours))),
        status:                   getCellValue(row, colStatus) || null,
        instructor,
        location:                 getCellValue(row, colLocation) || null,
        btw_start_time:           getCellTimeValue(row, colStartTime) || null,
        btw_end_time:             getCellTimeValue(row, colEndTime) || null,
        late_cancellation_via:    getCellValue(row, colLcVia) || null,
        logged_in_user:           getCellValue(row, colLoggedUser) || null,
        appt_id:                  getCellValue(row, colApptId) || null,
        student_id:               getCellValue(row, colStudentId) || null,
        student_cell:             getCellValue(row, colStudentCell) || null,
        account_balance:          parseNumber(getCellValue(row, colBalance)),
        service_package:          getCellValue(row, colPackage) || null,
        component_type:           getCellValue(row, colComponentType) || null,
        appointment_full_datetime: getCellValue(row, colApptDatetime) || null,
        student_notes:            getCellValue(row, colStudentNotes) || null,
        appointment_notes:        getCellValue(row, colApptNotes) || null,
      })
    }

    if (payloads.length === 0) return { inserted: 0, updated: 0, skipped }

    const rowKey = (s: string, d: string, t: string | null | undefined, ins: string) =>
      `${s}|${d}|${t ?? ''}|${ins}`

    // ── 2. Dedup within file ────────────────────────────────────────────────
    const dedupMap = new Map<string, Partial<NoShowPayroll>>()
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
    const toInsert: Partial<NoShowPayroll>[] = []
    const toUpdate: Partial<NoShowPayroll>[] = []

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
      await this.repo.save(toUpdate.slice(i, i + CHUNK) as NoShowPayroll[])
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
      .createQueryBuilder('ns')
      .orderBy('ns.date_of_btw', 'DESC')
      .addOrderBy('ns.btw_start_time', 'ASC')

    if (start_date) qb.andWhere('ns.date_of_btw >= :start_date', { start_date })
    if (end_date)   qb.andWhere('ns.date_of_btw <= :end_date', { end_date })
    if (instructor) qb.andWhere('ns.instructor ILIKE :instructor', { instructor: `%${instructor}%` })
    if (status)     qb.andWhere('ns.status ILIKE :status', { status: `%${status}%` })

    qb.skip((page - 1) * limit).take(limit)

    const [data, total] = await qb.getManyAndCount()
    return { total, page, limit, data }
  }
}

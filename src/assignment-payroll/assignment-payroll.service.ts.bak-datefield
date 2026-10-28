import type { UploadProgress } from '../common/upload-progress.util'
import { Injectable, BadRequestException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository, Between } from 'typeorm'
import { UploadValidator, applyCorrections, UploadCorrection, UploadValidationInfo } from '../common/upload-validation.util'
import { updateRecord, deleteRecord, EditableSpec } from '../common/payroll-record-edit.util'
import * as ExcelJS from 'exceljs'
import { AssignmentPayroll } from './entities/assignment-payroll.entity'
import { DanubenetHistoryService } from '../danubenet-history/danubenet-history.service'

const EDITABLE_FIELDS: EditableSpec = {
    student_name: { type: 'string', required: true },
    type: { type: 'string' },
    package: { type: 'string' },
    date_of_btw: { type: 'date', required: true },
    payment_date: { type: 'date', required: true },
    btw_start_time: { type: 'string', max: 20 },
    btw_end_time: { type: 'string', max: 20 },
    number_of_hours: { type: 'number' },
    instructor: { type: 'string', required: true },
    status: { type: 'string' },
    location: { type: 'string' },
    student_notes: { type: 'string' },
    assigned: { type: 'string' },
}

@Injectable()
export class AssignmentPayrollService {
  constructor(
    @InjectRepository(AssignmentPayroll)
    private readonly repo: Repository<AssignmentPayroll>,
    private readonly danubenetHistory: DanubenetHistoryService,
  ) {}

  async uploadExcel(buffer: Buffer, onProgress?: (p: Partial<UploadProgress>) => void, corrections?: UploadCorrection[], onlyRows?: number[]): Promise<{ validation?: UploadValidationInfo; inserted: number; updated: number; skipped: number }> {
    onProgress?.({ phase: 'parsing' })
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(buffer)

    const sheet = workbook.worksheets[0]
    if (!sheet) throw new BadRequestException('El archivo Excel no tiene hojas')
    applyCorrections(sheet, corrections ?? [])
    const onlyRowsSet = onlyRows && onlyRows.length ? new Set(onlyRows) : null // reintento: solo estas filas

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
    const colPaymentDate = col(['payment date'])
    const colStartTime   = col(['btw start time', 'start time'])
    const colEndTime     = col(['btw end time', 'end time'])
    const colHours       = col(['number of hours', 'hours'])
    const colInstructor  = col(['instructor'])
    const colStatus      = col(['status'])
    const colLocation    = col(['location'])
    const colNotes       = col(['student notes', 'notes'])
    const colAssigned    = col(['assigned'])

    if (!colStudentName || !colDate || !colInstructor || !colPaymentDate) {
      throw new BadRequestException(
        'Columnas requeridas no encontradas: Student Name, Date of BTW, Instructor, Payment Date',
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
    const validator = new UploadValidator()

    for (let i = 2; i <= sheet.rowCount; i++) {
      if (onlyRowsSet && !onlyRowsSet.has(i)) continue
      const row        = sheet.getRow(i)
      const studentName = getCellValue(row, colStudentName).trim()
      const dateOfBtw   = getCellDate(row, colDate)
      const paymentDate = getCellDate(row, colPaymentDate)
      const instructor  = getCellValue(row, colInstructor).trim()

      if (!studentName && !dateOfBtw && !instructor) continue // fila vacía
      validator.context(i, [studentName, instructor].filter(Boolean).join(' · '))
      validator.required('Student Name', studentName, i, colStudentName)
      validator.date('Date of BTW', getCellValue(row, colDate), dateOfBtw, i, colDate)
      validator.required('Instructor', instructor, i, colInstructor)
      validator.date('Payment Date', getCellValue(row, colPaymentDate), paymentDate, i, colPaymentDate)
      if (validator.rowFailed(i)) continue

      payloads.push({
        student_name:  studentName,
        type:          getCellValue(row, colType) || null,
        package:       getCellValue(row, colPackage) || null,
        date_of_btw:   dateOfBtw,
        payment_date:  paymentDate,
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

    const validation = validator.result() // filas con error: NO se importan, se devuelven al front

    if (payloads.length === 0) return { inserted: 0, updated: 0, skipped, validation }

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
    const CHUNK = 200        // inserts: una consulta multi-fila por bloque
    const CHUNK_UPDATE = 50  // updates: TypeORM hace un UPDATE por fila; bloques chicos = progreso más fino
    let savedCount = 0
    onProgress?.({ phase: 'saving', done: 0, total: toInsert.length + toUpdate.length, inserted: toInsert.length, updated: toUpdate.length, skipped })
    for (let i = 0; i < toInsert.length; i += CHUNK) {
      const batch = toInsert.slice(i, i + CHUNK)
      await this.repo.save(batch.map(p => this.repo.create(p)))
      savedCount += batch.length
      onProgress?.({ done: savedCount })
    }
    for (let i = 0; i < toUpdate.length; i += CHUNK_UPDATE) {
      const batch = toUpdate.slice(i, i + CHUNK_UPDATE)
      await this.repo.save(batch as AssignmentPayroll[])
      savedCount += batch.length
      onProgress?.({ done: savedCount })
    }

    return { inserted: toInsert.length, updated: toUpdate.length, skipped, validation }
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
      .orderBy('ap.payment_date', 'DESC')
      .addOrderBy('ap.btw_start_time', 'ASC')

    if (start_date) qb.andWhere('ap.payment_date >= :start_date', { start_date })
    if (end_date)   qb.andWhere('ap.payment_date <= :end_date', { end_date })
    if (instructor) qb.andWhere('ap.instructor ILIKE :instructor', { instructor: `%${instructor}%` })
    if (status)     qb.andWhere('ap.status ILIKE :status', { status: `%${status}%` })

    qb.skip((page - 1) * limit).take(limit)

    const [data, total] = await qb.getManyAndCount()

    // Resuelve employee_number por (instructor, date_of_btw) contra el
    // historial de danubenet_history — no se usa danubanet_name_1/2 del
    // empleado. Sin registro de historial que contenga la fecha = sin match.
    const danubenetIndex = await this.danubenetHistory.buildIndex()
    const dataWithMatch = data.map((row) => ({
      ...row,
      employee_number: this.danubenetHistory.resolveEmployeeNumber(danubenetIndex, row.instructor, row.date_of_btw),
    }))

    return { total, page, limit, data: dataWithMatch }
  }

  // ── Edición / eliminación puntual ──
  update(id: string, body: Record<string, any>) {
    return updateRecord(this.repo, id, body, EDITABLE_FIELDS)
  }

  remove(id: string) {
    return deleteRecord(this.repo, id)
  }
}

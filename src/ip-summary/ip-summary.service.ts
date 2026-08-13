import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository, Between } from 'typeorm'
import axios from 'axios'
import { InstructorPayroll } from '../instructor-payroll/entities/instructor-payroll.entity'
import { TeacherPayroll } from '../teacher-payroll/entities/teacher-payroll.entity'
import { AssignmentPayroll } from '../assignment-payroll/entities/assignment-payroll.entity'
import { NoShowPayroll } from '../no-show-payroll/entities/no-show-payroll.entity'
import { AssignmentRateType } from '../assignment-rate-types/entities/assignment-rate-type.entity'
import { DanubenetHistoryService } from '../danubenet-history/danubenet-history.service'
import { DanubenetHistory } from '../danubenet-history/entities/danubenet-history.entity'
import { buildIpSummaryExcel } from '../common/excel-export.util'

const RATE_TYPE_FIELD: Record<string, string> = {
  BTW: 'btw_rate',
  ASSIGNMENT: 'assignment_rate',
  'CLASS C': 'class_c_rate',
  'Department2, Diego Sanchez Mechanical': 'mechanics_rate',
  OFFICE: 'office_assignment_rate',
  'Stick shift': 'ss_rate',
}

const AS_TYPES = [
  { key: 'BTW',        label: 'BTW',         rateType: 'BTW',                                    cellBg: '#e0f7fa', bg: '#b2ebf2', color: '#006064' },
  { key: 'ASSIGNMENT', label: 'Asgn.',       rateType: 'ASSIGNMENT',                             cellBg: '#e0f2f1', bg: '#80cbc4', color: '#004d40' },
  { key: 'CLASS_C',    label: 'Class C',     rateType: 'CLASS C',                                cellBg: '#e8f5e9', bg: '#a5d6a7', color: '#1b5e20' },
  { key: 'OFFICE',     label: 'Office',      rateType: 'OFFICE',                                 cellBg: '#fffde7', bg: '#fff176', color: '#f57f17' },
  { key: 'MECHANICS',  label: 'Mec.',        rateType: 'Department2, Diego Sanchez Mechanical',  cellBg: '#fff3e0', bg: '#ffcc80', color: '#e65100' },
  { key: 'SS',         label: 'Stick Shift', rateType: 'Stick shift',                            cellBg: '#f3e5f5', bg: '#ce93d8', color: '#6a1b9a' },
]

const RATE_FIELDS_NEEDED = [
  'btw_rate', 'cr_rate', 'assignment_rate', 'class_c_rate',
  'office_assignment_rate', 'ss_rate', 'mechanics_rate', 'no_show_cancellation_rate',
]

type RatePeriod = { rate: number; start_date: string; end_date: string | null }

// Un tramo de danubenet_history (identidad) puede contener 2+ PERÍODOS de
// employee_rate_history (rate) — son ejes independientes. RateBucket
// acumula count/hours/pay por cada período de rate realmente aplicado
// dentro de un hijo, para poder mostrar "Rate 1 ($40, 05/01-05/10)" y
// "Rate 2 ($41, 05/11-05/31)" en vez de promediarlos en un solo número.
type RateBucket = { rate: number; start_date: string; end_date: string | null; hours: number; pay: number; count: number }

type AsBucket = { count: number; hours: number; pay: number; by_rate: Record<string, RateBucket> }

type ChildBucket = {
  danubenet_name: string
  // min_date/max_date: ventana de ESTA fila puntual — para un empleado
  // matcheado es el sub-rango de RATE (puede ser más angosto que el tramo
  // completo, si el rate cambió a mitad del tramo); para un orphan es el
  // rango real de sus propios registros (no hay tramo que lo ancle).
  min_date: string
  max_date: string
  // segment_period_start/end: ventana COMPLETA del tramo de
  // danubenet_history (identidad) al que pertenece esta fila — igual para
  // TODAS las sub-filas de rate de un mismo tramo. Es un eje independiente
  // del rate: una cosa es "de quién es el nombre" y otra "qué le pagaron".
  segment_period_start: string
  segment_period_end: string
  segment_id: number | null // id del tramo de danubenet_history que ancla este hijo (null = orphan, sin tramo)
  btw_count: number; btw_hours: number; btw_pay: number; btw_by_rate: Record<string, RateBucket>
  tp_count: number; tp_hours: number; tp_pay: number; tp_by_rate: Record<string, RateBucket>
  ns_count: number; ns_hours: number; ns_pay: number; ns_by_rate: Record<string, RateBucket>
  as: Record<string, AsBucket>
}

@Injectable()
export class IpSummaryService {
  constructor(
    @InjectRepository(InstructorPayroll) private readonly ipRepo: Repository<InstructorPayroll>,
    @InjectRepository(TeacherPayroll) private readonly tpRepo: Repository<TeacherPayroll>,
    @InjectRepository(AssignmentPayroll) private readonly asRepo: Repository<AssignmentPayroll>,
    @InjectRepository(NoShowPayroll) private readonly nsRepo: Repository<NoShowPayroll>,
    @InjectRepository(AssignmentRateType) private readonly artRepo: Repository<AssignmentRateType>,
    private readonly danubenetHistory: DanubenetHistoryService,
  ) {}

  /**
   * Trae, para un lote de employees y un rate_field puntual, los tramos de
   * employee_rate_history (ya desencriptados) que solapan [start_date,
   * end_date] — mismo patrón que hr_backend/payroll.service.ts usa para
   * Nova/V-Out (ver fetchRateHistoryPeriods ahí). Sin ratesToken devuelve
   * {} y el caller trata cada registro como "sin rate configurado" (pay 0),
   * nunca cae a un valor plano desactualizado.
   */
  private async fetchRateHistoryPeriods(
    employeeNumbers: string[],
    rateField: string,
    startDate: string,
    endDate: string,
    ratesToken?: string,
  ): Promise<Record<string, RatePeriod[]>> {
    if (!ratesToken || !employeeNumbers.length) return {}
    const nova = (process.env.NOVA_ONE_API ?? '').trim().replace(/\/+$/, '')
    if (!nova) return {}
    try {
      const { data } = await axios.post(
        `${nova}/employees/rate-history-batch`,
        { employee_numbers: employeeNumbers, rate_field: rateField, start_date: startDate, end_date: endDate },
        { headers: { 'X-Rates-Token': ratesToken }, timeout: 10000 },
      )
      return data?.periods ?? {}
    } catch (e: any) {
      console.error(`[IpSummary] No se pudieron obtener tramos de ${rateField}:`, e?.message ?? e)
      return {}
    }
  }

  private findPeriod(periods: RatePeriod[] | undefined, date: string): RatePeriod | undefined {
    if (!periods || !date) return undefined
    return periods.find((p) => date >= p.start_date && (p.end_date === null || date <= p.end_date))
  }

  private newChildBucket(name: string, date: string, segmentId: number | null = null): ChildBucket {
    return {
      danubenet_name: name,
      min_date: date,
      max_date: date,
      segment_period_start: date,
      segment_period_end: date,
      segment_id: segmentId,
      btw_count: 0, btw_hours: 0, btw_pay: 0, btw_by_rate: {},
      tp_count: 0, tp_hours: 0, tp_pay: 0, tp_by_rate: {},
      ns_count: 0, ns_hours: 0, ns_pay: 0, ns_by_rate: {},
      as: Object.fromEntries(AS_TYPES.map((t) => [t.key, { count: 0, hours: 0, pay: 0, by_rate: {} }])),
    }
  }

  /** iso + delta días (delta puede ser negativo), en UTC para evitar líos de timezone. */
  private addDays(iso: string, delta: number): string {
    const d = new Date(iso + 'T00:00:00Z')
    d.setUTCDate(d.getUTCDate() + delta)
    return d.toISOString().slice(0, 10)
  }

  /**
   * Divide [segStart, segEnd] (un tramo de danubenet_history) en sub-rangos
   * consecutivos usando la UNIÓN de las fronteras de TODOS los períodos de
   * employee_rate_history (los 8 rate_fields) que solapan ese tramo — así,
   * dentro de cualquier sub-rango, NINGÚN rate cambia a mitad de camino
   * (garantizado por construcción: se corta en cada frontera posible).
   * Si no hay ningún cambio de rate, devuelve un solo rango = [segStart, segEnd].
   */
  private splitByRateBoundaries(
    empNum: string,
    segStart: string,
    segEnd: string,
    periodsByField: Record<string, Record<string, RatePeriod[]>>,
  ): { start: string; end: string }[] {
    const cuts = new Set<string>([segStart])
    for (const field of RATE_FIELDS_NEEDED) {
      const periods = periodsByField[field]?.[empNum] ?? []
      for (const p of periods) {
        if (p.start_date > segStart && p.start_date <= segEnd) cuts.add(p.start_date)
        if (p.end_date && p.end_date >= segStart && p.end_date < segEnd) {
          const next = this.addDays(p.end_date, 1)
          if (next <= segEnd) cuts.add(next)
        }
      }
    }
    const sorted = Array.from(cuts).sort()
    const ranges: { start: string; end: string }[] = []
    for (let i = 0; i < sorted.length; i++) {
      const start = sorted[i]
      const end = i + 1 < sorted.length ? this.addDays(sorted[i + 1], -1) : segEnd
      if (start <= end) ranges.push({ start, end })
    }
    return ranges.length ? ranges : [{ start: segStart, end: segEnd }]
  }

  /**
   * Acumula count/hours/pay en el RateBucket del período de rate
   * REALMENTE aplicado (identificado por start_date+end_date+rate) — el
   * tramo de danubenet_history (identidad) y el período de
   * employee_rate_history (cuánto se paga) son ejes independientes; un
   * mismo hijo (danubenet_name+tramo) puede cruzar 2+ períodos de rate.
   * `period` undefined = sin rate configurado para esa fecha (hueco real).
   */
  private addRateBucket(map: Record<string, RateBucket>, period: RatePeriod | undefined, hours: number, pay: number) {
    const key = period ? `${period.start_date}|${period.end_date ?? ''}|${period.rate}` : '__norate__'
    if (!map[key]) {
      map[key] = { rate: period?.rate ?? 0, start_date: period?.start_date ?? '', end_date: period?.end_date ?? null, hours: 0, pay: 0, count: 0 }
    }
    map[key].hours += hours
    map[key].pay += pay
    map[key].count += 1
  }

  /** true si [segStart, segEnd] (segEnd null = indefinido) solapa [fStart, fEnd]. */
  private overlaps(segStart: string, segEnd: string | null, fStart: string, fEnd: string): boolean {
    return segStart <= fEnd && (!segEnd || segEnd >= fStart)
  }

  /** Intersección [segStart, segEnd] ∩ [fStart, fEnd] — para mostrar el período real relevante al reporte. */
  private clipRange(segStart: string, segEnd: string | null, fStart: string, fEnd: string): { start: string; end: string } {
    const start = segStart > fStart ? segStart : fStart
    const end = segEnd && segEnd < fEnd ? segEnd : fEnd
    return { start, end }
  }

  async buildExcel(start_date: string, end_date: string, ratesToken?: string): Promise<Buffer> {
    const orphanDetail: any[] = []
    const rows = await this.buildSummaryRows(start_date, end_date, ratesToken, orphanDetail)
    return buildIpSummaryExcel(rows, AS_TYPES, orphanDetail)
  }

  /**
   * Fuente de verdad única del resumen de Instructor/Teacher/Assignment/
   * No-Show — usada tanto por el Excel (buildExcel) como por el endpoint
   * JSON que consume la tabla en pantalla / PDF de HrsAutorizadas.vue. Antes
   * esta lógica estaba duplicada (una copia acá, otra en el computed
   * ipSummaryRows del frontend) — con la duplicación, Excel y pantalla
   * podían divergir. Ahora ambos llaman a este único cálculo.
   */
  async buildSummaryRows(
    start_date: string,
    end_date: string,
    ratesToken?: string,
    orphanDetailOut?: any[],
  ): Promise<any[]> {
    const num = (x: any) => parseFloat(x) || 0
    const norm = (s: any) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '')

    const [ipRows, tpRows, asRows, nsRows, artList] = await Promise.all([
      this.ipRepo.find({ where: { date_of_btw: Between(start_date, end_date) } as any }),
      this.tpRepo.find({ where: { session_date: Between(start_date, end_date) } as any }),
      this.asRepo.find({ where: { date_of_btw: Between(start_date, end_date) } as any }),
      this.nsRepo.find({ where: { date_of_btw: Between(start_date, end_date) } as any }),
      this.artRepo.find(),
    ])

    const artLookup: Record<string, string> = {}
    for (const a of artList as any[]) {
      const n = String(a.assignment_name || '').trim().toLowerCase()
      if (n) artLookup[n] = a.rate_type
    }

    // 1. Identidad: resolver, por CADA registro contra su propia fecha, no
    // solo el employee_number sino el TRAMO completo de danubenet_history
    // que lo cubre (nunca por nombre plano contra danubanet_name_1/2). Un
    // mismo empleado puede haber tenido el mismo danubenet_name en 2+ tramos
    // NO contiguos (ej: Ene-Mar, luego un hueco, luego May, luego Jun, luego
    // Ago-ongoing) — cada tramo se muestra como su propia fila porque el
    // rate (employee_rate_history) puede haber cambiado entre uno y otro.
    const danubenetIndex = await this.danubenetHistory.buildIndex()
    const resolveSeg = (name: string, date: string): DanubenetHistory | null =>
      this.danubenetHistory.resolveSegment(danubenetIndex, name, date)

    const ipResolved = (ipRows as any[]).map((r) => {
      const seg = resolveSeg(r.instructor, r.date_of_btw)
      return { ...r, employee_number: seg?.employee_number ?? null, __seg: seg }
    })
    const tpResolved = (tpRows as any[]).map((r) => {
      const nm = r.teacher || r.teacher_name || r.instructor
      const seg = resolveSeg(nm, r.session_date)
      return { ...r, _name: nm, employee_number: seg?.employee_number ?? null, __seg: seg }
    })
    const asResolved = (asRows as any[]).map((r) => {
      const seg = resolveSeg(r.instructor, r.date_of_btw)
      return { ...r, employee_number: seg?.employee_number ?? null, __seg: seg }
    })
    const nsResolved = (nsRows as any[]).map((r) => {
      const seg = resolveSeg(r.instructor, r.date_of_btw)
      return { ...r, employee_number: seg?.employee_number ?? null, __seg: seg }
    })

    const allEmployeeNumbers = Array.from(new Set(
      [...ipResolved, ...tpResolved, ...asResolved, ...nsResolved]
        .map((r) => r.employee_number)
        .filter((x): x is string => !!x),
    ))

    // 2. Datos de empleado — ya NO se usan para resolver identidad (eso lo
    // hizo danubenet_history arriba), solo para mostrar nombre/apellido.
    let empList: any[] = []
    try {
      const r = await axios.get(`${process.env.NOVA_ONE_API}/employees`, {
        headers: ratesToken ? { 'X-Rates-Token': ratesToken } : {},
      })
      empList = r.data?.employees ?? (Array.isArray(r.data) ? r.data : [])
    } catch (e) {
      empList = []
    }
    const empByNumber: Record<string, any> = {}
    for (const e of empList) if (e.employee_number) empByNumber[e.employee_number] = e

    // 3. Tramos reales de employee_rate_history, uno por cada uno de los 8
    // rate_fields que usa Instructor/Teacher/Assignment/No-Show, para todos
    // los empleados matcheados. Cada registro se resuelve contra SU PROPIA
    // fecha — si el rate cambió a mitad del rango filtrado, cada registro
    // cobra el tramo que le corresponde según su fecha, no un valor plano.
    const periodsByField: Record<string, Record<string, RatePeriod[]>> = {}
    await Promise.all(RATE_FIELDS_NEEDED.map(async (field) => {
      periodsByField[field] = await this.fetchRateHistoryPeriods(allEmployeeNumbers, field, start_date, end_date, ratesToken)
    }))

    // 4. Agrupar: PADRE = employee_number real (ya resuelto por fecha).
    // HIJO = cada TRAMO de danubenet_history que ese empleado usó dentro del
    // rango. Y dentro de CADA tramo, si employee_rate_history cambió de rate
    // a mitad de camino (son ejes independientes: identidad vs. cuánto se
    // paga), el tramo se PRE-DIVIDE en sub-rangos — cada uno es su propia
    // FILA, con su propio REG/HRS/RATE/TOTAL, no una celda con 2 rates
    // apilados. "Período" (columna) sigue siendo el tramo completo de
    // danubenet_history — igual para todas las sub-filas de ese tramo;
    // "Rate Period" es el sub-rango puntual de esta fila.
    //
    // `orphans`: registros cuyo danubenet_name NO resolvió ningún tramo para
    // su fecha (hueco real en danubenet_history) — se agrupan por nombre
    // normalizado (una fila por danubenet_name huérfano) para poder ver
    // EXACTAMENTE qué nombre/cuántos registros/cuántas horas quedaron sin
    // empleado. Sin padre, sin rate posible (employee_rate_history es por
    // employee_number) — su período se deja en null en buildRow.
    const parents: Record<string, Record<string, ChildBucket>> = {}
    const orphans: Record<string, ChildBucket> = {}

    // matchedEmployees/allSegments: para PRE-SEMBRAR, antes de procesar
    // ningún registro, todas las sub-filas (tramo × sub-rango de rate) de
    // cada empleado que aparece en al menos un registro resuelto — así los
    // 4 loops de atribución de abajo solo necesitan encontrar en qué
    // sub-fila cae la fecha de cada registro, nunca inventan un corte.
    const matchedEmployees = new Set<string>(
      [...ipResolved, ...tpResolved, ...asResolved, ...nsResolved]
        .map((r) => r.employee_number)
        .filter((x): x is string => !!x),
    )
    const allSegments: DanubenetHistory[] = []
    for (const list of danubenetIndex.values()) allSegments.push(...list)

    // Índice de búsqueda: dado (empleado, nombre normalizado, fecha) →
    // en qué sub-fila (bucket key) cae. Se llena durante la pre-siembra.
    const subRangeIndex: Record<string, Record<string, { start: string; end: string; key: string }[]>> = {}

    for (const empNum of matchedEmployees) {
      const segments = allSegments.filter(
        (s) => s.employee_number === empNum && this.overlaps(s.start_date, s.end_date, start_date, end_date),
      )
      for (const seg of segments) {
        const nameKey = norm(seg.danubenet_name)
        const { start: segStart, end: segEnd } = this.clipRange(seg.start_date, seg.end_date, start_date, end_date)
        const subRanges = this.splitByRateBoundaries(empNum, segStart, segEnd, periodsByField)
        const bucket = (parents[empNum] ??= {})
        const idxForEmp = (subRangeIndex[empNum] ??= {})
        const entries = (idxForEmp[nameKey] ??= [])
        subRanges.forEach((sr, i) => {
          const k = `${nameKey}::${seg.id}::${i}`
          if (!bucket[k]) {
            const b = this.newChildBucket(seg.danubenet_name, sr.start, seg.id)
            b.max_date = sr.end
            b.segment_period_start = segStart
            b.segment_period_end = segEnd
            bucket[k] = b
          }
          entries.push({ start: sr.start, end: sr.end, key: k })
        })
      }
    }

    const getChild = (empNum: string | null, rawName: string, seg: DanubenetHistory | null, date: string): ChildBucket => {
      const nameKey = norm(rawName)
      if (!empNum || !seg) {
        if (!orphans[nameKey]) orphans[nameKey] = this.newChildBucket(rawName, date)
        const b = orphans[nameKey]
        if (date < b.min_date) b.min_date = date
        if (date > b.max_date) b.max_date = date
        return b
      }
      const bucket = (parents[empNum] ??= {})
      const entries = subRangeIndex[empNum]?.[nameKey] ?? []
      const found = entries.find((e) => date >= e.start && date <= e.end)
      if (found) return bucket[found.key]
      // Defensivo — no debería pasar (la pre-siembra cubre todo el tramo
      // resuelto por resolveSegment), pero si algún borde de fecha se
      // escapa, se ancla en un bucket de emergencia en vez de perder el
      // registro.
      const k = `${nameKey}::${seg.id}::fallback`
      if (!bucket[k]) {
        const b = this.newChildBucket(rawName, date, seg.id)
        b.segment_period_start = seg.start_date
        b.segment_period_end = seg.end_date ?? end_date
        bucket[k] = b
      }
      return bucket[k]
    }

    // BTW (solo status complete cuenta para pago). IMPORTANTE: el filtro de
    // status se aplica DESPUÉS de registrar el detalle — antes hacía
    // `continue` primero, así que un BTW no-completo cuyo nombre tampoco
    // resolvía tramo desaparecía de TODA la vista (ni pagaba, ni salía en
    // "Sin empleado"). Ahora todo registro sin tramo se anota en
    // orphanDetailOut (completo o no, para poder auditarlo), y solo el
    // conteo/pago del bucket sigue exigiendo status complete.
    for (const r of ipResolved) {
      const isComplete = String(r.status || '').toLowerCase().includes('complet')
      if (!r.employee_number || !r.__seg) {
        orphanDetailOut?.push({ type: 'BTW', danubenet_name: r.instructor, date: r.date_of_btw, status: r.status || '', hours: num(r.number_of_hours) })
      }
      if (!isComplete) continue
      const period = r.employee_number ? this.findPeriod(periodsByField.btw_rate[r.employee_number], r.date_of_btw) : undefined
      const hours = num(r.number_of_hours)
      const pay = hours * (period?.rate ?? 0)
      const child = getChild(r.employee_number, r.instructor, r.__seg, r.date_of_btw)
      child.btw_count++
      child.btw_hours += hours
      child.btw_pay += pay
      this.addRateBucket(child.btw_by_rate, period, hours, pay)
    }

    // Teacher (CR)
    for (const r of tpResolved) {
      if (!r.employee_number || !r.__seg) {
        orphanDetailOut?.push({ type: 'CR', danubenet_name: r._name, date: r.session_date, status: '', hours: num(r.number_of_hours) })
      }
      const period = r.employee_number ? this.findPeriod(periodsByField.cr_rate[r.employee_number], r.session_date) : undefined
      const hours = num(r.number_of_hours)
      const pay = hours * (period?.rate ?? 0)
      const child = getChild(r.employee_number, r._name, r.__seg, r.session_date)
      child.tp_count++
      child.tp_hours += hours
      child.tp_pay += pay
      this.addRateBucket(child.tp_by_rate, period, hours, pay)
    }

    // Assignments (subdividido por tipo)
    for (const r of asResolved) {
      const student = String(r.student_name || '').toLowerCase()
      const isMech = student.includes('department2') || student.includes('diego sanchez')
      let rateType: string
      if (isMech) {
        rateType = 'Department2, Diego Sanchez Mechanical'
      } else {
        const tn = String(r.type || '').trim().toLowerCase()
        rateType = artLookup[tn] || 'ASSIGNMENT'
        if (rateType === 'Department2, Diego Sanchez Mechanical') rateType = 'ASSIGNMENT'
      }
      const asType = AS_TYPES.find((t) => t.rateType === rateType) || AS_TYPES.find((t) => t.key === 'ASSIGNMENT')
      if (!asType) continue
      if (!r.employee_number || !r.__seg) {
        orphanDetailOut?.push({ type: `Assignment (${asType.label})`, danubenet_name: r.instructor, date: r.date_of_btw, status: r.status || '', hours: num(r.number_of_hours) })
      }
      const empField = RATE_TYPE_FIELD[rateType]
      const period = r.employee_number ? this.findPeriod(periodsByField[empField]?.[r.employee_number], r.date_of_btw) : undefined
      const hours = num(r.number_of_hours)
      const pay = hours * (period?.rate ?? 0)
      const child = getChild(r.employee_number, r.instructor, r.__seg, r.date_of_btw)
      const bucket = child.as[asType.key]
      bucket.count++
      bucket.hours += hours
      bucket.pay += pay
      this.addRateBucket(bucket.by_rate, period, hours, pay)
    }

    // No Show
    for (const r of nsResolved) {
      if (!r.employee_number || !r.__seg) {
        orphanDetailOut?.push({ type: 'No Show', danubenet_name: r.instructor, date: r.date_of_btw, status: r.status || '', hours: num(r.number_of_hours) })
      }
      const period = r.employee_number ? this.findPeriod(periodsByField.no_show_cancellation_rate[r.employee_number], r.date_of_btw) : undefined
      const hours = num(r.number_of_hours)
      const pay = hours * (period?.rate ?? 0)
      const child = getChild(r.employee_number, r.instructor, r.__seg, r.date_of_btw)
      child.ns_count++
      child.ns_hours += hours
      child.ns_pay += pay
      this.addRateBucket(child.ns_by_rate, period, hours, pay)
    }

    // Convierte un *_by_rate map a un array ordenado por fecha — solo se
    // expone como `_breakdown` cuando hay 2+ períodos de rate distintos
    // dentro del mismo hijo (si hay 1 solo, el campo *_rate escalar ya
    // representa el rate real, sin necesidad de desglose). Con el
    // pre-seccionado por sub-rango (splitByRateBoundaries) esto ya casi
    // nunca debería pasar de longitud 1 dentro de una sola fila — se deja
    // como red de seguridad defensiva.
    const toBreakdown = (map: Record<string, RateBucket>) =>
      Object.values(map).sort((a, b) => a.start_date.localeCompare(b.start_date))

    const buildRow = (c: ChildBucket, empNum: string | null, emp: any, unmatched: boolean) => {
      let asTotalPay = 0
      const asFields: any = {}
      for (const t of AS_TYPES) {
        const b = c.as[t.key]
        asFields[`as_${t.key}_count`] = b.count
        asFields[`as_${t.key}_hours`] = b.hours
        asFields[`as_${t.key}_rate`] = b.hours > 0 ? b.pay / b.hours : null
        asFields[`as_${t.key}_pay`] = b.count ? b.pay : null
        const asBreakdown = toBreakdown(b.by_rate)
        if (asBreakdown.length > 1) asFields[`as_${t.key}_rate_breakdown`] = asBreakdown
        asTotalPay += b.pay
      }
      const total_pay = c.btw_pay + c.tp_pay + asTotalPay + c.ns_pay
      const btwBreakdown = toBreakdown(c.btw_by_rate)
      const tpBreakdown = toBreakdown(c.tp_by_rate)
      const nsBreakdown = toBreakdown(c.ns_by_rate)
      // `period`: SIEMPRE el tramo COMPLETO de danubenet_history
      // (segment_period_start/end) — igual para todas las sub-filas de un
      // mismo tramo, aunque cada una tenga su propio rate_period. Un orphan
      // NO tiene tramo (por eso está sin empleado): se deja en null, nunca
      // se inventa a partir de las fechas de sus propios registros.
      const period = unmatched
        ? null
        : (c.segment_period_start === c.segment_period_end
            ? c.segment_period_start
            : `${c.segment_period_start} → ${c.segment_period_end}`)
      // `rate_period`: el sub-rango puntual de ESTA fila (frontera de
      // employee_rate_history dentro del tramo) — puede coincidir con
      // `period` si el tramo no cruzó ningún cambio de rate, o ser más
      // angosto si sí lo hizo (entonces el tramo produce 2+ filas, una por
      // rate_period, cada una con su propio REG/HRS/RATE/TOTAL).
      const rate_period = unmatched
        ? null
        : (c.min_date === c.max_date ? c.min_date : `${c.min_date} → ${c.max_date}`)
      return {
        instructor_name: c.danubenet_name,
        // segment_id: id del tramo de danubenet_history — igual para todas
        // las sub-filas de rate de un mismo tramo. El frontend/Excel lo
        // usan para fusionar visualmente DanubeNet Name/Período entre esas
        // sub-filas (nunca entre tramos distintos, aunque compartan nombre).
        // null para orphans (sin tramo real).
        segment_id: unmatched ? null : c.segment_id,
        period,
        rate_period,
        // period_start/period_end: límites SIN formatear del rate_period de
        // esta fila (no del tramo completo) — el frontend los usa para
        // filtrar cuáles registros crudos pertenecen REALMENTE a esta
        // sub-fila (no solo por nombre) al armar el PDF. null para orphans.
        period_start: unmatched ? null : c.min_date,
        period_end: unmatched ? null : c.max_date,
        // segment_period_start/end: límites SIN formatear del TRAMO
        // completo (igual para todas las sub-filas de un mismo segment_id)
        // — el PDF los usa para renderizar "Período" con su propio formato
        // (M/D/Y + separador ASCII), en vez de parsear la flecha "→" del
        // string ya formateado (esa flecha no existe en la fuente estándar
        // de jsPDF y se veía como caracteres corruptos). null para orphans.
        segment_period_start: unmatched ? null : c.segment_period_start,
        segment_period_end: unmatched ? null : c.segment_period_end,
        matched_employee_number: empNum,
        matched_full_name: emp ? `${emp.name || ''} ${emp.last_name || ''}`.trim() : empNum,
        unmatched, // true = no se encontró tramo en danubenet_history para este nombre/fecha — revisar el historial
        btw_count: c.btw_count, btw_hours: c.btw_hours,
        btw_rate: c.btw_hours > 0 ? c.btw_pay / c.btw_hours : null,
        btw_pay: c.btw_count ? c.btw_pay : null,
        // Se expone SOLO cuando hubo 2+ períodos de rate distintos dentro de
        // este hijo — employee_rate_history es independiente del tramo de
        // danubenet_history, así que un mismo hijo puede cruzar 2+ rates.
        // El frontend debe preferir esto sobre btw_rate (que sería un
        // promedio engañoso) cuando esté presente.
        btw_rate_breakdown: btwBreakdown.length > 1 ? btwBreakdown : undefined,
        tp_count: c.tp_count, tp_hours: c.tp_hours,
        cr_rate: c.tp_hours > 0 ? c.tp_pay / c.tp_hours : null,
        tp_pay: c.tp_count ? c.tp_pay : null,
        cr_rate_breakdown: tpBreakdown.length > 1 ? tpBreakdown : undefined,
        ns_count: c.ns_count, ns_hours: c.ns_hours,
        no_show_cancellation_rate: c.ns_hours > 0 ? c.ns_pay / c.ns_hours : null,
        ns_pay: c.ns_count ? c.ns_pay : null,
        no_show_rate_breakdown: nsBreakdown.length > 1 ? nsBreakdown : undefined,
        total_pay,
        employee_total_pay: null as number | null, // se completa abajo (empleados matcheados) o queda null (orphans)
        ...asFields,
      }
    }

    // 5. Aplanar a filas — una fila por hijo, ordenadas por empleado (para
    // que buildIpSummaryExcel pueda fusionar visualmente las celdas de
    // Employee #/Nombre/Total cuando un empleado tiene 2+ hijos) y luego por
    // fecha de inicio del período de cada hijo.
    const employeeNumbers = Object.keys(parents).sort((a, b) => {
      const na = `${empByNumber[a]?.last_name || ''} ${empByNumber[a]?.name || ''}`.trim() || a
      const nb = `${empByNumber[b]?.last_name || ''} ${empByNumber[b]?.name || ''}`.trim() || b
      return na.localeCompare(nb)
    })

    const rows: any[] = []
    for (const empNum of employeeNumbers) {
      const emp = empByNumber[empNum]
      // Ordenar por tramo (segment_period_start, y luego segment_id para
      // desempatar tramos que arrancan el mismo día) y DENTRO de cada tramo
      // por rate_period (min_date) — así las sub-filas de un mismo tramo
      // quedan siempre contiguas, requisito para poder fusionar
      // DanubeNet Name/Período en Excel y en la tabla del frontend.
      const children = Object.values(parents[empNum]).sort((a, b) =>
        a.segment_period_start.localeCompare(b.segment_period_start) ||
        (a.segment_id ?? 0) - (b.segment_id ?? 0) ||
        a.min_date.localeCompare(b.min_date),
      )

      let employeeTotal = 0
      const childRows = children.map((c) => {
        const row = buildRow(c, empNum, emp, false)
        employeeTotal += row.total_pay
        return row
      })
      childRows.forEach((r) => { r.employee_total_pay = employeeTotal })
      rows.push(...childRows)
    }

    // Orphans al final, uno por danubenet_name (no un resumen ciego) —
    // ordenados por nombre, sin padre, sin employee_total_pay.
    const orphanChildren = Object.values(orphans).sort((a, b) => a.danubenet_name.localeCompare(b.danubenet_name))
    for (const c of orphanChildren) {
      rows.push(buildRow(c, null, null, true))
    }

    return rows
  }
}

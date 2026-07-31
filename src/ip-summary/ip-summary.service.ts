import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository, Between } from 'typeorm'
import axios from 'axios'
import { InstructorPayroll } from '../instructor-payroll/entities/instructor-payroll.entity'
import { TeacherPayroll } from '../teacher-payroll/entities/teacher-payroll.entity'
import { AssignmentPayroll } from '../assignment-payroll/entities/assignment-payroll.entity'
import { NoShowPayroll } from '../no-show-payroll/entities/no-show-payroll.entity'
import { AssignmentRateType } from '../assignment-rate-types/entities/assignment-rate-type.entity'
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

@Injectable()
export class IpSummaryService {
  constructor(
    @InjectRepository(InstructorPayroll) private readonly ipRepo: Repository<InstructorPayroll>,
    @InjectRepository(TeacherPayroll) private readonly tpRepo: Repository<TeacherPayroll>,
    @InjectRepository(AssignmentPayroll) private readonly asRepo: Repository<AssignmentPayroll>,
    @InjectRepository(NoShowPayroll) private readonly nsRepo: Repository<NoShowPayroll>,
    @InjectRepository(AssignmentRateType) private readonly artRepo: Repository<AssignmentRateType>,
  ) {}

  async buildExcel(start_date: string, end_date: string, ratesToken?: string): Promise<Buffer> {
    const num = (x: any) => parseFloat(x) || 0
    const norm = (s: any) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '')

    const [ipRows, tpRows, asRows, nsRows, artList] = await Promise.all([
      this.ipRepo.find({ where: { date_of_btw: Between(start_date, end_date) } as any }),
      this.tpRepo.find({ where: { session_date: Between(start_date, end_date) } as any }),
      this.asRepo.find({ where: { date_of_btw: Between(start_date, end_date) } as any }),
      this.nsRepo.find({ where: { date_of_btw: Between(start_date, end_date) } as any }),
      this.artRepo.find(),
    ])

    // Empleados (con rates + danubanet) desde el backend Python. Los rates
    // (btw_rate, cr_rate, etc.) viven encriptados ahí — sin X-Rates-Token
    // vigente, nova-one-backend los devuelve en null (no rompe el excel,
    // solo esas columnas quedan en blanco), igual que en /employees desde
    // el frontend.
    let empList: any[] = []
    try {
      const r = await axios.get(`${process.env.NOVA_ONE_API}/employees`, {
        headers: ratesToken ? { 'X-Rates-Token': ratesToken } : {},
      })
      empList = r.data?.employees ?? (Array.isArray(r.data) ? r.data : [])
    } catch (e) {
      empList = []
    }

    const artLookup: Record<string, string> = {}
    for (const a of artList as any[]) {
      const n = String(a.assignment_name || '').trim().toLowerCase()
      if (n) artLookup[n] = a.rate_type
    }

    const empByDanuba: Record<string, any> = {}
    const empByName: Record<string, any> = {}
    for (const e of empList) {
      for (const dn of [e.danubanet_name_1, e.danubanet_name_2]) {
        const k = norm(dn)
        if (k) empByDanuba[k] = e
      }
      const a = norm(`${e.last_name || ''} ${e.name || ''}`)
      const b = norm(`${e.name || ''} ${e.last_name || ''}`)
      if (a && !empByName[a]) empByName[a] = e
      if (b && !empByName[b]) empByName[b] = e
    }
    const matchEmp = (...names: any[]): any => {
      for (const nm of names) { const k = norm(nm); if (empByDanuba[k]) return empByDanuba[k] }
      for (const nm of names) { const k = norm(nm); if (empByName[k]) return empByName[k] }
      return null
    }
    const canonKey = (emp: any, name: any) =>
      emp && emp.employee_number ? `emp:${emp.employee_number}` : norm(name)

    // BTW (solo status complete)
    const btwMap: any = {}
    for (const r of ipRows as any[]) {
      if (!String(r.status || '').toLowerCase().includes('complet')) continue
      const emp = matchEmp(r.instructor)
      const key = canonKey(emp, r.instructor)
      if (!key) continue
      if (!btwMap[key]) btwMap[key] = { count: 0, hours: 0, rate: null, pay: null, emp: null, name: r.instructor }
      btwMap[key].count++
      btwMap[key].hours += num(r.number_of_hours)
      if (btwMap[key].rate == null && emp && emp.btw_rate != null) btwMap[key].rate = num(emp.btw_rate)
      if (!btwMap[key].emp && emp) btwMap[key].emp = emp
    }
    for (const k of Object.keys(btwMap)) btwMap[k].pay = btwMap[k].rate != null ? btwMap[k].hours * btwMap[k].rate : null

    // Teacher (CR)
    const tpMap: any = {}
    for (const r of tpRows as any[]) {
      const name = r.teacher || r.teacher_name || r.instructor
      const emp = matchEmp(r.teacher, r.teacher_name, r.instructor)
      const key = canonKey(emp, name)
      if (!key) continue
      if (!tpMap[key]) tpMap[key] = { count: 0, hours: 0, rate: null, pay: null, emp: null, name }
      tpMap[key].count++
      tpMap[key].hours += num(r.number_of_hours)
      if (tpMap[key].rate == null && emp && emp.cr_rate != null) tpMap[key].rate = num(emp.cr_rate)
      if (!tpMap[key].emp && emp) tpMap[key].emp = emp
    }
    for (const k of Object.keys(tpMap)) tpMap[k].pay = tpMap[k].rate != null ? tpMap[k].hours * tpMap[k].rate : null

    // Assignments (subdividido por tipo)
    const asMap: any = {}
    for (const r of asRows as any[]) {
      const emp = matchEmp(r.instructor)
      const key = canonKey(emp, r.instructor)
      if (!key) continue
      if (!asMap[key]) {
        asMap[key] = { emp: null, name: r.instructor }
        for (const t of AS_TYPES) asMap[key][t.key] = { count: 0, hours: 0, rate: null, pay: null }
      }
      if (!asMap[key].emp && emp) asMap[key].emp = emp

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
      const bucket = asMap[key][asType.key]
      bucket.count++
      bucket.hours += num(r.number_of_hours)
      const empField = RATE_TYPE_FIELD[rateType]
      if (bucket.rate == null && emp && emp[empField] != null) bucket.rate = num(emp[empField])
    }
    for (const k of Object.keys(asMap)) {
      for (const t of AS_TYPES) {
        const b = asMap[k][t.key]
        b.pay = b.rate != null ? b.hours * b.rate : null
      }
    }

    // No Show
    const nsMap: any = {}
    for (const r of nsRows as any[]) {
      const emp = matchEmp(r.instructor)
      const key = canonKey(emp, r.instructor)
      if (!key) continue
      if (!nsMap[key]) nsMap[key] = { count: 0, hours: 0, rate: null, pay: null, emp: null, name: r.instructor }
      nsMap[key].count++
      nsMap[key].hours += num(r.number_of_hours)
      if (nsMap[key].rate == null && emp && emp.no_show_cancellation_rate != null) nsMap[key].rate = num(emp.no_show_cancellation_rate)
      if (!nsMap[key].emp && emp) nsMap[key].emp = emp
    }
    for (const k of Object.keys(nsMap)) nsMap[k].pay = nsMap[k].rate != null ? nsMap[k].hours * nsMap[k].rate : null

    const allKeys = new Set<string>([
      ...Object.keys(btwMap),
      ...Object.keys(tpMap),
      ...Object.keys(asMap),
      ...Object.keys(nsMap),
    ])

    const summaryRows = Array.from(allKeys).map((key) => {
      const btw = btwMap[key] || { count: 0, hours: 0, rate: null, pay: null }
      const tp = tpMap[key] || { count: 0, hours: 0, rate: null, pay: null }
      const asg = asMap[key] || {}
      const ns = nsMap[key] || { count: 0, hours: 0, rate: null, pay: null }
      const emp = btw.emp || tp.emp || asg.emp || ns.emp || null
      const name = btw.name || tp.name || asg.name || ns.name || key

      let asTotalPay = 0
      const asFields: any = {}
      for (const t of AS_TYPES) {
        const b = asg[t.key] || { count: 0, hours: 0, rate: null, pay: null }
        asFields[`as_${t.key}_count`] = b.count
        asFields[`as_${t.key}_hours`] = b.hours
        asFields[`as_${t.key}_rate`] = b.rate
        asFields[`as_${t.key}_pay`] = b.pay
        if (b.pay != null) asTotalPay += b.pay
      }

      const total_pay = (btw.pay || 0) + (tp.pay || 0) + asTotalPay + (ns.pay || 0)

      return {
        instructor_name: name,
        matched_employee_number: emp ? emp.employee_number : null,
        matched_full_name: emp ? `${emp.name || ''} ${emp.last_name || ''}`.trim() : null,
        btw_count: btw.count,
        btw_hours: btw.hours,
        btw_rate: btw.rate,
        btw_pay: btw.pay,
        tp_count: tp.count,
        tp_hours: tp.hours,
        cr_rate: tp.rate,
        tp_pay: tp.pay,
        ns_count: ns.count,
        ns_hours: ns.hours,
        no_show_cancellation_rate: ns.rate,
        ns_pay: ns.pay,
        total_pay,
        ...asFields,
      }
    }).sort((a, b) => String(a.instructor_name).localeCompare(String(b.instructor_name)))

    return buildIpSummaryExcel(summaryRows, AS_TYPES)
  }
}

import { Injectable, InternalServerErrorException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, In, Repository } from 'typeorm';
import { Employee } from '../employees/entities/employee.entity';
import { ScheduleEvent } from 'src/schedule_event/entities/schedule_event.entity';
import { Timesheet } from './entities/timesheet.entity';
import { Holiday } from 'src/holidays/entities/holiday.entity';
import { WorkSchedule } from 'src/employees/entities/work-schedule.enum';
import { RegisterEnum } from 'src/schedule_event/entities/register.enum';
import * as puppeteer from 'puppeteer';
import { buildPayrollHtml } from './templates/payroll-report.template';
import axios from 'axios';
import * as ExcelJS from 'exceljs';

@Injectable()
export class PayrollService {
  constructor(
    @InjectRepository(Employee)
    private readonly employeeRepository: Repository<Employee>,
    @InjectRepository(ScheduleEvent)
    private readonly scheduleEventRepository: Repository<ScheduleEvent>,
    @InjectRepository(Timesheet)
    private readonly timesheetRepository: Repository<Timesheet>,
    @InjectRepository(Holiday)
    private readonly holidayRepository: Repository<Holiday>,
  ) {}

  private calculateHours(start: string, end: string): number {
    const startTime = new Date(start).getTime();
    const endTime   = new Date(end).getTime();
    return (endTime - startTime) / (1000 * 60 * 60);
  }

  private parseCsvDate(raw: string): string | null {
    try {
      const d = new Date(raw.trim());
      if (isNaN(d.getTime())) return null;
      const yyyy = d.getFullYear();
      const mm   = String(d.getMonth() + 1).padStart(2, '0');
      const dd   = String(d.getDate()).padStart(2, '0');
      return `${yyyy}-${mm}-${dd}`;
    } catch {
      return null;
    }
  }

  // ── Holidays ─────────────────────────────────────────────────────────────
  private async fetchHolidaysInRange(
    start_date: string,
    end_date: string,
  ): Promise<Holiday[]> {
    return this.holidayRepository
      .createQueryBuilder('h')
      .where('h.is_active = true')
      .andWhere('h.date >= :start_date', { start_date })
      .andWhere('h.date <= :end_date', { end_date })
      .orderBy('h.date', 'ASC')
      .getMany();
  }

  private async fetchCompensations(
    employee_numbers: string[],
    start_date: string,
    end_date: string,
  ): Promise<Record<string, { in_favor: any[]; to_deduct: any[] }>> {
    try {
      const baseUrl = process.env.ACCOUNTING_API;
      const { data } = await axios.post<{ by_employee: any[] }>(
        `${baseUrl}/employee-compensation/payroll-summary`,
        { from: start_date, to: end_date, employee_numbers },
        { timeout: 10_000 },
      );

      const map: Record<string, { in_favor: any[]; to_deduct: any[] }> = {};
      for (const entry of data.by_employee ?? []) {
        map[entry.employee_number] = {
          in_favor:  entry.in_favor  ?? [],
          to_deduct: entry.to_deduct ?? [],
        };
      }
      return map;
    } catch (error) {
      console.error('⚠️  fetchCompensations falló:', error.message);
      return {};
    }
  }

  async parseTimesheetCsv(buffer: Buffer): Promise<{
    employee: string;
    total_hours: number;
  }[]> {
    const content = buffer.toString('utf-8');
    const lines   = content.split('\n').map(l => l.trim()).filter(Boolean);

    if (!lines.length) return [];

    const headers = lines[0].split(',').map(h => h.trim());
    const col     = (name: string) => headers.indexOf(name);

    const colEmployee   = col('Employee');
    const colHourType   = col('Hour Type');
    const colDayDate    = col('DayDate');
    const colIn         = col('In');
    const colOut        = col('Out');
    const colHours      = col('Hours');
    const colPaidBreak  = col('Paid Break');
    const colUnpaidBreak    = col('Unpaid Break');
    const colDayWise        = col('DayWiseTotalHours');
    const colTotalHours     = col('Total Hours');
    const colTotalPaid      = col('TotalPaidBreak');
    const colTotalUnpaid    = col('TotalUnpaidBreak');
    const colTotalDayWise   = col('TotalDaywiseTotalhours');

    if (colEmployee === -1 || colHours === -1) {
      throw new Error('CSV must have "Employee" and "Hours" columns');
    }

    const toUpsert: Partial<Timesheet>[] = [];

    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',');

      const employee = cols[colEmployee]?.trim();
      if (!employee) continue;

      const hours    = parseFloat(cols[colHours]?.trim() ?? '0');
      const day_date = this.parseCsvDate(cols[colDayDate]?.trim() ?? '');
      if (!day_date) continue;

      const time_in  = cols[colIn]?.trim()  || null;
      const time_out = cols[colOut]?.trim() || null;

      toUpsert.push({
        employee,
        hour_type:  cols[colHourType]?.trim() || 'Regular',
        day_date,
        time_in:    time_in  === '0' ? null : time_in,
        time_out:   time_out === '0' ? null : time_out,
        hours:      Number.isFinite(hours) ? hours : 0,
        paid_break:               parseFloat(cols[colPaidBreak]?.trim()   ?? '0') || 0,
        unpaid_break:             parseFloat(cols[colUnpaidBreak]?.trim() ?? '0') || 0,
        day_wise_total_hours:     parseFloat(cols[colDayWise]?.trim()     ?? '0') || 0,
        total_hours:              parseFloat(cols[colTotalHours]?.trim()  ?? '0') || 0,
        total_paid_break:         parseFloat(cols[colTotalPaid]?.trim()   ?? '0') || 0,
        total_unpaid_break:       parseFloat(cols[colTotalUnpaid]?.trim() ?? '0') || 0,
        total_day_wise_total_hours: parseFloat(cols[colTotalDayWise]?.trim() ?? '0') || 0,
      });
    }

    console.log(`Rows to upsert: ${toUpsert.length}`);

    const BATCH = 100;
    for (let i = 0; i < toUpsert.length; i += BATCH) {
      const batch = toUpsert.slice(i, i + BATCH);
      await this.timesheetRepository
        .createQueryBuilder()
        .insert()
        .into(Timesheet)
        .values(batch as Timesheet[])
        .orUpdate(
          [
            'hour_type', 'time_out', 'hours', 'paid_break', 'unpaid_break',
            'day_wise_total_hours', 'total_hours', 'total_paid_break',
            'total_unpaid_break', 'total_day_wise_total_hours',
          ],
          ['employee', 'day_date', 'time_in'],
        )
        .execute();
    }

    const saved = await this.timesheetRepository
      .createQueryBuilder('t')
      .select('t.employee', 'employee')
      .addSelect('SUM(t.hours)', 'total_hours')
      .where('t.hours > 0')
      .groupBy('t.employee')
      .orderBy('t.employee', 'ASC')
      .getRawMany();

    return saved.map(row => ({
      employee:    row.employee,
      total_hours: parseFloat(parseFloat(row.total_hours).toFixed(2)),
    }));
  }

  private async fetchTcwHours(
    employees: Array<{ employee_number: string; name: string; last_name: string }>,
    start_date: string,
    end_date: string,
  ): Promise<Record<string, number>> {
    try {
      const rows = await this.timesheetRepository
        .createQueryBuilder('t')
        .select('t.employee', 'employee')
        .addSelect('SUM(t.hours)', 'total_hours')
        .where('t.day_date >= :start_date::date', { start_date })
        .andWhere('t.day_date <= :end_date::date', { end_date })
        .andWhere('t.hours > 0')
        .groupBy('t.employee')
        .getRawMany();

      console.log(`TCW rows found for range [${start_date} - ${end_date}]:`, rows.length);

      const norm = (s: string) =>
        s.toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-z\s]/g, '')
          .replace(/\s+/g, ' ')
          .trim();

      const tokenize = (s: string) => norm(s).split(/\s+/).filter(Boolean);

      const tcwMap = new Map<string, number>();
      for (const row of rows) {
        tcwMap.set(norm(row.employee), parseFloat(row.total_hours));
      }

      const result: Record<string, number> = {};

      for (const emp of employees) {
        const empTokens = tokenize(`${emp.name} ${emp.last_name}`);
        let bestKey: string | null = null;
        let bestScore = 0;

        for (const [csvName] of tcwMap) {
          const csvTokens = tokenize(csvName);
          const matches   = empTokens.filter(t => csvTokens.includes(t)).length;
          const score     = matches / Math.min(empTokens.length, csvTokens.length);
          if (score > bestScore) { bestScore = score; bestKey = csvName; }
        }

        if (bestKey && bestScore >= 0.75) {
          const hours = tcwMap.get(bestKey)!;
          result[emp.employee_number] = parseFloat(hours.toFixed(2));
          console.log(`✅ TCW match: "${emp.name} ${emp.last_name}" → "${bestKey}" (score: ${bestScore.toFixed(2)}, hours: ${hours})`);
        } else {
          console.log(`⚠️  TCW no match: "${emp.name} ${emp.last_name}" (best: "${bestKey}", score: ${bestScore.toFixed(2)})`);
        }
      }

      return result;
    } catch (error) {
      console.error('⚠️  fetchTcwHours falló:', error.message);
      return {};
    }
  }

  async getPayrollData(work_schedule: WorkSchedule, start_date: string, end_date: string) {
    try {
      console.log('work_schedule recibido:', JSON.stringify(work_schedule));
      console.log('Rango de fecha:', { start_date, end_date });

      const totalActive = await this.employeeRepository.count({
        where: { status: 'Active' },
      });
      console.log('Total empleados Active:', totalActive);

      const schedules = await this.employeeRepository
        .createQueryBuilder('e')
        .select('DISTINCT e.work_schedule', 'work_schedule')
        .where('e.status = :status', { status: 'Active' })
        .getRawMany();
      console.log('work_schedules existentes en DB:', schedules);

      const employees = await this.employeeRepository.find({
        where: { status: 'Active', work_schedule },
        select: {
          employee_number: true,
          name: true,
          last_name: true,
          work_schedule: true,
          type_of_income: true,
          pay_frequency: true,
          rate_office_staff: true,
          receives_comissions: true,
          commissions: true,
          type_of_schedule: true,
          payment_method: true,
          assignment_rate: true,
          btw_rate: true,
          class_c_rate: true,
          cr_rate: true,
          ss_rate: true,
          corporate_rate: true,
          mechanics_rate: true,
          office_maintenance: true,
          amount_bonus: true,
          bonus_type: true,
          type_of_comissions: true,
          authorized_hours: true,
        },
      });

      console.log(`Registros encontrados para work_schedule "${work_schedule}":`, employees.length);

      const employeeNumbers = employees.map(e => e.employee_number);
      if (!employeeNumbers.length) return [];

      const events = await this.scheduleEventRepository.find({
        where: {
          date: Between(start_date, end_date),
          register: In([RegisterEnum.TIME_OFF_REQUEST, RegisterEnum.EXTRA_HOURS]),
          schedule: { employee_number: In(employeeNumbers) },
        },
        relations: ['schedule'],
      });

      console.log(`Eventos encontrados en rango [${start_date} - ${end_date}]:`, events.length);

      const eventsByEmployee: Record<string, {
        timeOffHours: number;
        extraHours: number;
        timeOffCount: number;
        extraHoursCount: number;
      }> = {};

      for (const event of events) {
        const empNumber = event.schedule.employee_number;
        if (!eventsByEmployee[empNumber]) {
          eventsByEmployee[empNumber] = {
            timeOffHours: 0, extraHours: 0,
            timeOffCount: 0, extraHoursCount: 0,
          };
        }
        const rawHours = this.calculateHours(event.start, event.end);
        if (event.register === RegisterEnum.TIME_OFF_REQUEST) {
          eventsByEmployee[empNumber].timeOffHours += Math.min(rawHours, 8);
          eventsByEmployee[empNumber].timeOffCount += 1;
        } else if (event.register === RegisterEnum.EXTRA_HOURS) {
          eventsByEmployee[empNumber].extraHours += rawHours;
          eventsByEmployee[empNumber].extraHoursCount += 1;
        }
      }

      const empList = employees.map(e => ({
        employee_number: e.employee_number,
        name:            e.name,
        last_name:       e.last_name,
      }));

      const [advancedByEmployee, workHoursOne, workHoursVout, tcwHours, holidaysInRange, compensationMap] =
        await Promise.all([
          this.fetchAdvancedRequests(start_date, end_date),
          this.fetchWorkHoursNewActivity(employeeNumbers, start_date, end_date),
          this.fetchWorkHoursActivityReport(empList, start_date, end_date),
          this.fetchTcwHours(empList, start_date, end_date),
          this.fetchHolidaysInRange(start_date, end_date),
          this.fetchCompensations(employeeNumbers, start_date, end_date),
        ]);

      console.log(`Holidays in range [${start_date} - ${end_date}]:`, holidaysInRange.length);
      console.log(`Compensations loaded for ${Object.keys(compensationMap).length} employees`);

      const result = employees.map(emp => ({
        ...emp,
        period: { start_date, end_date },
        time_off: {
          total_requests: eventsByEmployee[emp.employee_number]?.timeOffCount ?? 0,
          total_hours:    parseFloat(
            (eventsByEmployee[emp.employee_number]?.timeOffHours ?? 0).toFixed(2),
          ),
        },
        extra_hours: {
          total_requests: eventsByEmployee[emp.employee_number]?.extraHoursCount ?? 0,
          total_hours:    parseFloat(
            (eventsByEmployee[emp.employee_number]?.extraHours ?? 0).toFixed(2),
          ),
        },
        advanced_requests: {
          total_requests: advancedByEmployee[emp.employee_number]?.requests_count ?? 0,
          total_amount:   parseFloat(
            (advancedByEmployee[emp.employee_number]?.total_advanced ?? 0).toFixed(2),
          ),
        },
        activity_report_one: {
          total_hours:   workHoursOne[emp.employee_number]?.total_hours   ?? null,
          total_minutes: workHoursOne[emp.employee_number]?.total_minutes ?? null,
        },
        activity_report_vout: {
          total_hours:   workHoursVout[emp.employee_number]?.total_hours   ?? null,
          total_minutes: workHoursVout[emp.employee_number]?.total_minutes ?? null,
        },
        tcw_hours: {
          total_hours: tcwHours[emp.employee_number] ?? null,
        },
        // ── Holidays — array completo para que el template los liste uno a uno
        holidays_in_range: holidaysInRange.map(h => ({
          id:   h.id,
          name: h.name,
          date: h.date,
        })),
        // ── Compensations
        compensation_summary: {
          in_favor:  compensationMap[emp.employee_number]?.in_favor  ?? [],
          to_deduct: compensationMap[emp.employee_number]?.to_deduct ?? [],
        },
      }));

      return result;

    } catch (error) {
      console.error('Error en getPayrollData:', error);
      if (error instanceof BadRequestException) throw error;
      throw new InternalServerErrorException(
        `Error al obtener datos de payroll: ${error.message}`,
      );
    }
  }

  async generatePayrollPdf(
    work_schedule: WorkSchedule,
    start_date: string,
    end_date: string,
  ): Promise<Buffer> {
    const data = await this.getPayrollData(work_schedule, start_date, end_date);
    const html = buildPayrollHtml(data, work_schedule, start_date, end_date);

    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'networkidle0' });
      const buffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: '24px', bottom: '24px', left: '24px', right: '24px' },
      });
      return Buffer.from(buffer);
    } finally {
      await browser.close();
    }
  }

  async hasTimesheetDataForRange(start_date: string, end_date: string): Promise<boolean> {
    const count = await this.timesheetRepository
      .createQueryBuilder('t')
      .where('t.day_date >= :start_date::date', { start_date })
      .andWhere('t.day_date <= :end_date::date', { end_date })
      .andWhere('t.hours > 0')
      .getCount();

    return count > 0;
  }

  private async fetchAdvancedRequests(
    start_date: string,
    end_date: string,
  ): Promise<Record<string, { total_advanced: number; requests_count: number }>> {
    try {
      const baseUrl = process.env.ACCOUNTING_API;
      const { data } = await axios.get<any[]>(`${baseUrl}/advanced-request/filter`, {
        params: { status: 'Processed', processed_from: start_date, processed_to: end_date },
        timeout: 8_000,
      });

      const byEmployee: Record<string, { total_advanced: number; requests_count: number }> = {};
      for (const req of data) {
        const empNum = req.employee_data?.employee_number;
        if (!empNum) continue;
        if (!byEmployee[empNum]) byEmployee[empNum] = { total_advanced: 0, requests_count: 0 };
        byEmployee[empNum].total_advanced  += parseFloat(req.amount ?? 0);
        byEmployee[empNum].requests_count  += 1;
      }
      return byEmployee;
    } catch (error) {
      console.error('⚠️  fetchAdvancedRequests falló:', error.message);
      return {};
    }
  }

  private async fetchWorkHoursNewActivity(
    employeeNumbers: string[],
    start_date: string,
    end_date: string,
  ): Promise<Record<string, { total_hours: number; total_minutes: number }>> {
    try {
      const baseUrl = process.env.ACTIVITY_REPORT_ONE_API;
      const { data } = await axios.post<{ ok: boolean; data: any[] }>(
        `${baseUrl}/new-activity/work-hours`,
        { employee_numbers: employeeNumbers, start_date, end_date },
        { timeout: 10_000 },
      );

      const map: Record<string, { total_hours: number; total_minutes: number }> = {};
      for (const row of data.data ?? []) {
        map[row.employee_number] = {
          total_hours:   row.total_hours,
          total_minutes: row.total_minutes,
        };
      }
      return map;
    } catch (error) {
      console.error('⚠️  fetchWorkHoursNewActivity falló:', error.message);
      return {};
    }
  }

  private async fetchWorkHoursActivityReport(
    employees: Array<{ employee_number: string; name: string; last_name: string }>,
    start_date: string,
    end_date: string,
  ): Promise<Record<string, { total_hours: number; total_minutes: number }>> {
    try {
      const baseUrl = process.env.VOUT_API;
      const fullNames = employees.map(e => `${e.name} ${e.last_name}`);

      const { data } = await axios.post<{ ok: boolean; data: any[] }>(
        `${baseUrl}/activity_report/work-hours`,
        { full_names: fullNames, start_date, end_date },
        { timeout: 10_000 },
      );

      const norm = (s: string) =>
        s.toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-z\s]/g, '')
          .replace(/\s+/g, ' ')
          .trim();

      const nameToNumber = new Map(
        employees.map(e => [norm(`${e.name} ${e.last_name}`), e.employee_number]),
      );

      console.log('VOUT nameToNumber keys:', [...nameToNumber.keys()]);

      const map: Record<string, { total_hours: number; total_minutes: number }> = {};

      for (const row of data.data ?? []) {
        const rowNorm  = norm(row.employee_name ?? '');
        const empNumber = nameToNumber.get(rowNorm);

        console.log(`VOUT row: "${row.employee_name}" → norm: "${rowNorm}" → emp: ${empNumber ?? '❌ NO MATCH'}`);

        if (!empNumber) continue;

        map[empNumber] = {
          total_hours:   row.total_hours,
          total_minutes: row.total_minutes,
        };
      }

      return map;
    } catch (error) {
      console.error('⚠️  fetchWorkHoursActivityReport falló:', error.message);
      return {};
    }
  }

  async exportClockComparisonExcel(
    start_date: string,
    end_date: string,
  ): Promise<Buffer> {

    const tcwRecords = await this.timesheetRepository
      .createQueryBuilder('t')
      .where('t.day_date >= :start_date::date', { start_date })
      .andWhere('t.day_date <= :end_date::date', { end_date })
      .orderBy('t.day_date', 'ASC')
      .addOrderBy('t.employee', 'ASC')
      .addOrderBy('t.time_in', 'ASC')
      .getMany();

    console.log(`TCW records: ${tcwRecords.length}`);

    let activityOneData: {
      date: string;
      employee_number: string;
      employee_name: string;
      clock_in: string;
      clock_out: string;
      clock_out_status: string;
    }[] = [];

    try {
      const baseUrl = process.env.ACTIVITY_REPORT_ONE_API;
      const { data } = await axios.post(
        `${baseUrl}/new-activity/clock-report/data`,
        { start_date, end_date },
        { timeout: 15_000 },
      );
      activityOneData = data?.data ?? [];
      console.log(`Activity ONE records: ${activityOneData.length}`);
    } catch (error) {
      console.error('⚠️  Activity ONE clock-report/data falló:', error.message);
    }

    let activityVoutData: {
      date: string;
      employee_name: string;
      clock_in: string;
      clock_out: string;
      clock_out_status: string;
    }[] = [];

    try {
      const baseUrl = process.env.VOUT_API;
      const { data } = await axios.post(
        `${baseUrl}/activity_report/clock-report/data`,
        { start_date, end_date },
        { timeout: 15_000 },
      );
      activityVoutData = data?.data ?? [];
      console.log(`Activity VOUT records: ${activityVoutData.length}`);
    } catch (error) {
      console.error('⚠️  Activity VOUT clock-report/data falló:', error.message);
    }

    const norm = (s: string) =>
      s.toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9\s]/g, '')
        .replace(/\s+/g, ' ')
        .trim();

    const tokenize = (s: string) => norm(s).split(/\s+/).filter(Boolean);

    const matchScore = (a: string, b: string): number => {
      const ta = tokenize(a);
      const tb = tokenize(b);
      if (!ta.length || !tb.length) return 0;
      const matches = ta.filter(t => tb.includes(t)).length;
      return matches / Math.min(ta.length, tb.length);
    };

    const parseTimeToMinutes = (t: string): number | null => {
      if (!t || t === '—' || t.toLowerCase().includes('no clock')) return null;
      const m24 = t.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
      if (m24) return parseInt(m24[1]) * 60 + parseInt(m24[2]);
      const m12 = t.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
      if (m12) {
        let h = parseInt(m12[1]);
        const m   = parseInt(m12[2]);
        const mer = m12[3].toUpperCase();
        if (mer === 'PM' && h !== 12) h += 12;
        if (mer === 'AM' && h === 12) h = 0;
        return h * 60 + m;
      }
      return null;
    };

    const diffLabel = (minsDiff: number): string => {
      const abs  = Math.abs(minsDiff);
      const sign = minsDiff >= 0 ? '+' : '-';
      const h    = Math.floor(abs / 60);
      const m    = abs % 60;
      return h > 0 ? `${sign}${h}h ${m}m` : `${sign}${m}m`;
    };

    type OneEntry  = typeof activityOneData[0];
    type VoutEntry = typeof activityVoutData[0];

    const actOneIndex  = new Map<string, Map<string, OneEntry>>();
    const actVoutIndex = new Map<string, Map<string, VoutEntry>>();

    for (const row of activityOneData) {
      const nameNorm = norm(row.employee_name ?? '');
      if (!actOneIndex.has(nameNorm)) actOneIndex.set(nameNorm, new Map());
      actOneIndex.get(nameNorm)!.set(row.date, row);
    }

    for (const row of activityVoutData) {
      const nameNorm = norm(row.employee_name ?? '');
      if (!actVoutIndex.has(nameNorm)) actVoutIndex.set(nameNorm, new Map());
      actVoutIndex.get(nameNorm)!.set(row.date, row);
    }

    const findEntry = <T>(
      index: Map<string, Map<string, T>>,
      tcwName: string,
      date: string,
    ): T | null => {
      let bestKey   = '';
      let bestScore = 0;
      for (const [nameNorm] of index) {
        const score = matchScore(tcwName, nameNorm);
        if (score > bestScore) { bestScore = score; bestKey = nameNorm; }
      }
      console.log(`🔍 findEntry — TCW: "${tcwName}" | best: "${bestKey}" | score: ${bestScore.toFixed(2)} | date: ${date}`);
      if (bestKey && bestScore >= 0.75) {
        return index.get(bestKey)?.get(date) ?? null;
      }
      return null;
    };

    const tcwByEmpDay = new Map<string, Timesheet[]>();
    for (const r of tcwRecords) {
      const key = `${norm(r.employee)}__${r.day_date}`;
      if (!tcwByEmpDay.has(key)) tcwByEmpDay.set(key, []);
      tcwByEmpDay.get(key)!.push(r);
    }

    type ExcelRow = {
      date: string;
      tcw_employee: string;
      tcw_clock_in: string;
      tcw_clock_out: string;
      tcw_clock_out_status: string;
      tcw_hours: string;
      activity_employee: string;
      activity_total_hours: string;
      activity_clock_in: string;
      in_diff: string;
      activity_clock_out: string;
      out_diff: string;
      activity_status: string;
      match_source: string;
      match_result: string;
      _in_diff_mins: number | null;
      _out_diff_mins: number | null;
      _has_warning: boolean;
      _has_no_match: boolean;
      _has_tcw_missing_clock_out: boolean;
    };

    const rows: ExcelRow[] = [];

    for (const [, records] of tcwByEmpDay) {
      const first      = records[0];
      const tcwName    = first.employee;
      const date       = first.day_date;
      const totalHours = records.reduce((s, r) => s + parseFloat(String(r.hours ?? 0)), 0);
      const tcwIn      = first.time_in ?? '—';
      const tcwOut     = records[records.length - 1].time_out ?? '—';

      const oneEntry     = findEntry(actOneIndex,  tcwName, date);
      const voutEntry    = findEntry(actVoutIndex, tcwName, date);
      const matchedEntry = oneEntry ?? voutEntry ?? null;
      const matchSource  = oneEntry ? 'Activity ONE' : voutEntry ? 'Activity VOUT' : '—';

      const matchedIn  = matchedEntry ? parseTimeToMinutes(matchedEntry.clock_in)  : null;
      const matchedOut = matchedEntry ? parseTimeToMinutes(matchedEntry.clock_out) : null;

      let matchedHours = '—';
      if (matchedIn !== null && matchedOut !== null && matchedOut > matchedIn) {
        matchedHours = parseFloat(((matchedOut - matchedIn) / 60).toFixed(2)).toString();
      }

      const tcwInMins = parseTimeToMinutes(tcwIn);
      let inDiffMins: number | null = null;
      let inDiffStr = '—';
      if (tcwInMins !== null && matchedIn !== null) {
        inDiffMins = matchedIn - tcwInMins;
        inDiffStr  = Math.abs(inDiffMins) > 3
          ? `⚠️ ${diffLabel(inDiffMins)}`
          : `✅ ${diffLabel(inDiffMins)}`;
      }

      const tcwOutMins = parseTimeToMinutes(tcwOut);
      let outDiffMins: number | null = null;
      let outDiffStr = '—';
      if (tcwOutMins !== null && matchedOut !== null) {
        outDiffMins = matchedOut - tcwOutMins;
        outDiffStr  = Math.abs(outDiffMins) > 3
          ? `⚠️ ${diffLabel(outDiffMins)}`
          : `✅ ${diffLabel(outDiffMins)}`;
      }

      let clockOutLabel = '—';
      if (matchedEntry) {
        if (matchedEntry.clock_out_status === 'registered') {
          clockOutLabel = '✅ Clock Out registered';
        } else if (matchedEntry.clock_out_status === 'no_clock_out') {
          clockOutLabel = `🟠 NO CLOCK OUT — Last interaction found in ${matchSource}. Please verify the missing Clock Out in ${matchSource}.`;
        } else if (matchedEntry.clock_out_status === 'no_records') {
          clockOutLabel = `🟠 NO CLOCK OUT — No activity records found in ${matchSource}. Please verify in ${matchSource}.`;
        }
      }

      const tcwClockOutStatus = tcwOut === '—'
        ? '🟠 Missing Clock Out in TCW — Please verify and correct the missing Clock Out entry.'
        : '✅ OK';

      rows.push({
        date,
        tcw_employee:         tcwName,
        tcw_clock_in:         tcwIn,
        tcw_clock_out:        tcwOut,
        tcw_clock_out_status: tcwClockOutStatus,
        tcw_hours:            parseFloat(totalHours.toFixed(2)).toString(),
        activity_employee:    matchedEntry?.employee_name ?? '—',
        activity_total_hours: matchedHours,
        activity_clock_in:    matchedEntry?.clock_in  ?? '—',
        in_diff:              inDiffStr,
        activity_clock_out:   matchedEntry?.clock_out ?? '—',
        out_diff:             outDiffStr,
        activity_status:      clockOutLabel,
        match_source:         matchSource,
        match_result:         matchedEntry ? '✅ Match found' : '⚠️ No match found',
        _in_diff_mins:        inDiffMins,
        _out_diff_mins:       outDiffMins,
        _has_warning:         clockOutLabel.startsWith('🟠'),
        _has_no_match:        !matchedEntry,
        _has_tcw_missing_clock_out: tcwOut === '—',
      });
    }

    const colKeys = [
      'date', 'tcw_employee', 'tcw_clock_in', 'tcw_clock_out', 'tcw_clock_out_status', 'tcw_hours',
      'activity_employee', 'activity_total_hours', 'activity_clock_in', 'in_diff',
      'activity_clock_out', 'out_diff', 'activity_status', 'match_source', 'match_result',
    ];

    const headers = [
      'Date', 'TCW — Employee', 'TCW — Clock In', 'TCW — Clock Out', 'TCW — Clock Out Status', 'TCW — Hours',
      'Activity Report IN/OUT — Employee', 'Activity Report IN/OUT — Total Hrs', 'Activity Report IN/OUT — Clock In', '⚡ In Diff',
      'Activity Report IN/OUT — Clock Out', '⚡ Out Diff', 'Activity Report IN/OUT — Status', '📌 Source', 'Match Result',
    ];

    const colWidths = headers.map(h => h.length + 4);
    for (const row of rows) {
      colKeys.forEach((key, i) => {
        const val = String((row as any)[key] ?? '');
        if (val.length + 4 > colWidths[i]) colWidths[i] = val.length + 4;
      });
    }
    const finalWidths = colWidths.map(w => Math.min(Math.max(w, 10), 60));

    const wb = new ExcelJS.Workbook();
    wb.creator = 'Nova ONE';
    wb.created = new Date();

    const ws = wb.addWorksheet('Clock Comparison', {
      properties: { tabColor: { argb: 'FF1A2C4E' } },
    });

    ws.columns = colKeys.map((key, i) => ({
      header: headers[i],
      key,
      width:  finalWidths[i],
    }));

    const TOTAL_COLS = colKeys.length;

    const applyBorder = (cell: ExcelJS.Cell) => {
      cell.border = {
        top:    { style: 'thin', color: { argb: 'FF000000' } },
        left:   { style: 'thin', color: { argb: 'FF000000' } },
        bottom: { style: 'thin', color: { argb: 'FF000000' } },
        right:  { style: 'thin', color: { argb: 'FF000000' } },
      };
    };

    const headerFills: Record<number, string> = {
      1: 'FF1A2C4E', 2: 'FF2E5090', 3: 'FF2E5090', 4: 'FF2E5090',
      5: 'FF2E5090', 6: 'FF2E5090', 7: 'FF1565C0', 8: 'FF1565C0',
      9: 'FF1565C0', 10: 'FF0D47A1', 11: 'FF1565C0', 12: 'FF0D47A1',
      13: 'FF1565C0', 14: 'FF4A148C', 15: 'FF37474F',
    };

    const headerRow = ws.getRow(1);
    headerRow.height = 26;

    for (let c = 1; c <= TOTAL_COLS; c++) {
      const cell = headerRow.getCell(c);
      cell.font      = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: headerFills[c] ?? 'FF1A2C4E' } };
      applyBorder(cell);
    }

    for (const row of rows) {
      const { _in_diff_mins, _out_diff_mins, _has_warning, _has_no_match, _has_tcw_missing_clock_out, ...rowData } = row;
      const excelRow = ws.addRow(rowData);
      excelRow.height = 24;

      for (let c = 1; c <= TOTAL_COLS; c++) {
        const cell = excelRow.getCell(c);
        cell.alignment = { vertical: 'middle', wrapText: false };
        applyBorder(cell);
      }

      for (let c = 2; c <= 6; c++) {
        excelRow.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F4FF' } };
        applyBorder(excelRow.getCell(c));
      }

      const col5 = excelRow.getCell(5);
      if (_has_tcw_missing_clock_out) {
        col5.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFDE8E8' } };
        col5.font = { bold: true, color: { argb: 'FFC0392B' }, size: 10 };
        col5.alignment = { vertical: 'middle', wrapText: true };
      } else {
        col5.font = { color: { argb: 'FF27AE60' }, size: 10 };
      }
      applyBorder(col5);

      const sourceCell = excelRow.getCell(14);
      if (row.match_source === 'Activity ONE')  sourceCell.font = { bold: true, color: { argb: 'FF1565C0' }, size: 10 };
      if (row.match_source === 'Activity VOUT') sourceCell.font = { bold: true, color: { argb: 'FF4A148C' }, size: 10 };
      applyBorder(sourceCell);

      if (_in_diff_mins !== null) {
        const cell = excelRow.getCell(10);
        if (Math.abs(_in_diff_mins) > 3) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF3CD' } };
          cell.font = { bold: true, color: { argb: 'FFB45309' }, size: 10 };
        } else {
          cell.font = { color: { argb: 'FF27AE60' }, size: 10 };
        }
        applyBorder(cell);
      }

      if (_out_diff_mins !== null) {
        const cell = excelRow.getCell(12);
        if (Math.abs(_out_diff_mins) > 3) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF3CD' } };
          cell.font = { bold: true, color: { argb: 'FFB45309' }, size: 10 };
        } else {
          cell.font = { color: { argb: 'FF27AE60' }, size: 10 };
        }
        applyBorder(cell);
      }

      if (_has_warning) {
        const col11 = excelRow.getCell(11);
        col11.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFDE8E8' } };
        col11.font = { bold: true, color: { argb: 'FFC0392B' }, size: 10 };
        applyBorder(col11);

        const col13 = excelRow.getCell(13);
        col13.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFDE8E8' } };
        col13.font      = { bold: true, color: { argb: 'FFC0392B' }, size: 10 };
        col13.alignment = { vertical: 'middle', wrapText: true };
        applyBorder(col13);
      }

      if (_has_no_match) {
        const matchCell = excelRow.getCell(15);
        matchCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF3CD' } };
        matchCell.font = { bold: true, color: { argb: 'FF856404' }, size: 10 };
        applyBorder(matchCell);
        for (let c = 7; c <= 14; c++) {
          const cell = excelRow.getCell(c);
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F5F5' } };
          applyBorder(cell);
        }
      } else {
        const matchCell = excelRow.getCell(15);
        matchCell.font = { color: { argb: 'FF27AE60' }, size: 10 };
        applyBorder(matchCell);
      }
    }

    ws.views    = [{ state: 'frozen', ySplit: 1 }];
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: TOTAL_COLS } };

    const buf = await wb.xlsx.writeBuffer();
    return Buffer.from(buf);
  }

  async getClockComparisonData(
    start_date: string,
    end_date: string,
  ): Promise<{
    date: string;
    tcw_employee: string;
    tcw_clock_in: string;
    tcw_clock_out: string;
    tcw_clock_out_status: string;
    tcw_hours: string;
    activity_employee: string;
    activity_total_hours: string;
    activity_clock_in: string;
    in_diff: string;
    in_diff_mins: number | null;
    activity_clock_out: string;
    out_diff: string;
    out_diff_mins: number | null;
    activity_status: string;
    match_source: string;
    match_result: string;
    has_tcw_missing_clock_out: boolean;
    has_activity_clock_out_warning: boolean;
    has_no_match: boolean;
  }[]> {
    const tcwRecords = await this.timesheetRepository
      .createQueryBuilder('t')
      .where('t.day_date >= :start_date::date', { start_date })
      .andWhere('t.day_date <= :end_date::date', { end_date })
      .orderBy('t.day_date', 'ASC')
      .addOrderBy('t.employee', 'ASC')
      .addOrderBy('t.time_in', 'ASC')
      .getMany();

    let activityOneData: {
      date: string;
      employee_number: string;
      employee_name: string;
      clock_in: string;
      clock_out: string;
      clock_out_status: string;
    }[] = [];

    try {
      const baseUrl = process.env.ACTIVITY_REPORT_ONE_API;
      const { data } = await axios.post(
        `${baseUrl}/new-activity/clock-report/data`,
        { start_date, end_date },
        { timeout: 15_000 },
      );
      activityOneData = data?.data ?? [];
    } catch (error) {
      console.error('⚠️  Activity ONE clock-report/data falló:', error.message);
    }

    let activityVoutData: {
      date: string;
      employee_name: string;
      clock_in: string;
      clock_out: string;
      clock_out_status: string;
    }[] = [];

    try {
      const baseUrl = process.env.VOUT_API;
      const { data } = await axios.post(
        `${baseUrl}/activity_report/clock-report/data`,
        { start_date, end_date },
        { timeout: 15_000 },
      );
      activityVoutData = data?.data ?? [];
    } catch (error) {
      console.error('⚠️  Activity VOUT clock-report/data falló:', error.message);
    }

    const norm = (s: string) =>
      s.toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9\s]/g, '')
        .replace(/\s+/g, ' ')
        .trim();

    const tokenize    = (s: string) => norm(s).split(/\s+/).filter(Boolean);
    const matchScore  = (a: string, b: string): number => {
      const ta = tokenize(a); const tb = tokenize(b);
      if (!ta.length || !tb.length) return 0;
      return ta.filter(t => tb.includes(t)).length / Math.min(ta.length, tb.length);
    };

    const parseTimeToMinutes = (t: string): number | null => {
      if (!t || t === '—' || t.toLowerCase().includes('no clock')) return null;
      const m24 = t.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
      if (m24) return parseInt(m24[1]) * 60 + parseInt(m24[2]);
      const m12 = t.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
      if (m12) {
        let h = parseInt(m12[1]); const m = parseInt(m12[2]); const mer = m12[3].toUpperCase();
        if (mer === 'PM' && h !== 12) h += 12;
        if (mer === 'AM' && h === 12) h = 0;
        return h * 60 + m;
      }
      return null;
    };

    const diffLabel = (minsDiff: number): string => {
      const abs = Math.abs(minsDiff); const sign = minsDiff >= 0 ? '+' : '-';
      const h = Math.floor(abs / 60); const m = abs % 60;
      return h > 0 ? `${sign}${h}h ${m}m` : `${sign}${m}m`;
    };

    type OneEntry  = typeof activityOneData[0];
    type VoutEntry = typeof activityVoutData[0];

    const actOneIndex  = new Map<string, Map<string, OneEntry>>();
    const actVoutIndex = new Map<string, Map<string, VoutEntry>>();

    for (const row of activityOneData) {
      const n = norm(row.employee_name ?? '');
      if (!actOneIndex.has(n)) actOneIndex.set(n, new Map());
      actOneIndex.get(n)!.set(row.date, row);
    }
    for (const row of activityVoutData) {
      const n = norm(row.employee_name ?? '');
      if (!actVoutIndex.has(n)) actVoutIndex.set(n, new Map());
      actVoutIndex.get(n)!.set(row.date, row);
    }

    const findEntry = <T>(index: Map<string, Map<string, T>>, tcwName: string, date: string): T | null => {
      let bestKey = ''; let bestScore = 0;
      for (const [n] of index) { const s = matchScore(tcwName, n); if (s > bestScore) { bestScore = s; bestKey = n; } }
      if (bestKey && bestScore >= 0.75) return index.get(bestKey)?.get(date) ?? null;
      return null;
    };

    const tcwByEmpDay = new Map<string, Timesheet[]>();
    for (const r of tcwRecords) {
      const key = `${norm(r.employee)}__${r.day_date}`;
      if (!tcwByEmpDay.has(key)) tcwByEmpDay.set(key, []);
      tcwByEmpDay.get(key)!.push(r);
    }

    const result: Awaited<ReturnType<typeof this.getClockComparisonData>> = [];

    for (const [, records] of tcwByEmpDay) {
      const first      = records[0];
      const tcwName    = first.employee;
      const date       = first.day_date;
      const totalHours = records.reduce((s, r) => s + parseFloat(String(r.hours ?? 0)), 0);
      const tcwIn      = first.time_in ?? '—';
      const tcwOut     = records[records.length - 1].time_out ?? '—';

      const oneEntry     = findEntry(actOneIndex,  tcwName, date);
      const voutEntry    = findEntry(actVoutIndex, tcwName, date);
      const matchedEntry = oneEntry ?? voutEntry ?? null;
      const matchSource  = oneEntry ? 'Activity ONE' : voutEntry ? 'Activity VOUT' : '—';

      const matchedIn  = matchedEntry ? parseTimeToMinutes(matchedEntry.clock_in)  : null;
      const matchedOut = matchedEntry ? parseTimeToMinutes(matchedEntry.clock_out) : null;

      let matchedHours = '—';
      if (matchedIn !== null && matchedOut !== null && matchedOut > matchedIn) {
        matchedHours = parseFloat(((matchedOut - matchedIn) / 60).toFixed(2)).toString();
      }

      const tcwInMins = parseTimeToMinutes(tcwIn);
      let inDiffMins: number | null = null; let inDiffStr = '—';
      if (tcwInMins !== null && matchedIn !== null) {
        inDiffMins = matchedIn - tcwInMins;
        inDiffStr  = Math.abs(inDiffMins) > 3 ? `⚠️ ${diffLabel(inDiffMins)}` : `✅ ${diffLabel(inDiffMins)}`;
      }

      const tcwOutMins = parseTimeToMinutes(tcwOut);
      let outDiffMins: number | null = null; let outDiffStr = '—';
      if (tcwOutMins !== null && matchedOut !== null) {
        outDiffMins = matchedOut - tcwOutMins;
        outDiffStr  = Math.abs(outDiffMins) > 3 ? `⚠️ ${diffLabel(outDiffMins)}` : `✅ ${diffLabel(outDiffMins)}`;
      }

      let clockOutLabel = '—';
      if (matchedEntry) {
        if (matchedEntry.clock_out_status === 'registered') clockOutLabel = '✅ Clock Out registered';
        else if (matchedEntry.clock_out_status === 'no_clock_out') clockOutLabel = `🟠 NO CLOCK OUT — Last interaction found in ${matchSource}. Please verify the missing Clock Out in ${matchSource}.`;
        else if (matchedEntry.clock_out_status === 'no_records')   clockOutLabel = `🟠 NO CLOCK OUT — No activity records found in ${matchSource}. Please verify in ${matchSource}.`;
      }

      result.push({
        date,
        tcw_employee:          tcwName,
        tcw_clock_in:          tcwIn,
        tcw_clock_out:         tcwOut,
        tcw_clock_out_status:  tcwOut === '—' ? '🟠 Missing Clock Out in TCW — Please verify and correct the missing Clock Out entry.' : '✅ OK',
        tcw_hours:             parseFloat(totalHours.toFixed(2)).toString(),
        activity_employee:     matchedEntry?.employee_name ?? '—',
        activity_total_hours:  matchedHours,
        activity_clock_in:     matchedEntry?.clock_in  ?? '—',
        in_diff:               inDiffStr,
        in_diff_mins:          inDiffMins,
        activity_clock_out:    matchedEntry?.clock_out ?? '—',
        out_diff:              outDiffStr,
        out_diff_mins:         outDiffMins,
        activity_status:       clockOutLabel,
        match_source:          matchSource,
        match_result:          matchedEntry ? '✅ Match found' : '⚠️ No match found',
        has_tcw_missing_clock_out:       tcwOut === '—',
        has_activity_clock_out_warning:  clockOutLabel.startsWith('🟠'),
        has_no_match:                    !matchedEntry,
      });
    }

    return result;
  }
}
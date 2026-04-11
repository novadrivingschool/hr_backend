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
import { buildSingleEmployeeHtml } from './templates/payroll-report.template';
import axios from 'axios';
import * as ExcelJS from 'exceljs';
import { EmployeeSchedule } from 'src/employee_schedule/entities/employee_schedule.entity';
import { PDFDocument } from 'pdf-lib';
import archiver from 'archiver';
import { PassThrough } from 'stream';
import * as JSZip from 'jszip';

type EmployeePdfItem = {
  employee_number: string;
  name: string;
  last_name: string;
  buffer: Buffer;
};

type AttendanceSource = 'time_clock_wizard' | 'activity_report' | null;

type AttendanceSourceOutput =
  | 'time_clock_wizard'
  | 'activity_report'
  | 'none'
  | 'holiday_schedule'
  | 'holiday_default_8h';

type PayableHoursSource =
  | 'master_schedule'
  | 'time_clock_wizard'
  | 'activity_report'
  | 'no_attendance_data'
  | 'holiday_schedule'
  | 'holiday_default_8h';



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
    @InjectRepository(EmployeeSchedule)
    private readonly scheduleRepo: Repository<EmployeeSchedule>,
  ) { }

  private formatPayrollRangeText(
    rangeStart: string | null | undefined,
    rangeEnd: string | null | undefined,
  ): string | null {
    const start = rangeStart ? String(rangeStart) : null;
    const end = rangeEnd ? String(rangeEnd) : null;

    if (start && end) return `${start} - ${end}`;
    return start || end || null;
  }

  private safeFileName(value: string): string {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9-_]+/g, '_')
      .replace(/^_+|_+$/g, '');
  }

  private async renderEmployeePdf(
    page: puppeteer.Page,
    emp: any,
    work_schedule: WorkSchedule,
    start_date: string,
    end_date: string,
  ): Promise<Buffer> {
    const html = buildSingleEmployeeHtml(emp, work_schedule, start_date, end_date);

    await page.setContent(html, {
      waitUntil: 'load',
      timeout: 0,
    });

    const contentHeight = await page.evaluate(() => {
      const container = document.getElementById('report-container');
      return container ? container.offsetHeight : document.body.scrollHeight;
    });

    const finalHeight = Math.max(contentHeight + 36, 900);

    const pdfBuffer = await page.pdf({
      width: '800px',
      height: `${finalHeight}px`,
      printBackground: true,
      margin: {
        top: '0',
        right: '0',
        bottom: '0',
        left: '0',
      },
      timeout: 0,
    });

    return Buffer.from(pdfBuffer);
  }

  private async renderEmployeePdfBuffer(
    page: puppeteer.Page,
    emp: any,
    work_schedule: WorkSchedule,
    start_date: string,
    end_date: string,
  ): Promise<Buffer> {
    const html = buildSingleEmployeeHtml(emp, work_schedule, start_date, end_date);

    await page.setContent(html, {
      waitUntil: 'load',
      timeout: 0,
    });

    await page.emulateMediaType('screen');

    const pdfBuffer = await page.pdf({
      format: 'Letter',
      printBackground: true,
      preferCSSPageSize: true,
      margin: {
        top: '0',
        right: '0',
        bottom: '0',
        left: '0',
      },
      timeout: 0,
    });

    return Buffer.from(pdfBuffer);
  }

  private async generatePayrollEmployeePdfs(
    work_schedule: WorkSchedule,
    start_date: string,
    end_date: string,
  ): Promise<EmployeePdfItem[]> {
    const data = await this.getPayrollData(work_schedule, start_date, end_date);

    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    try {
      const page = await browser.newPage();
      page.setDefaultNavigationTimeout(0);
      page.setDefaultTimeout(0);

      const result: EmployeePdfItem[] = [];

      for (const emp of data) {
        const buffer = await this.renderEmployeePdf(
          page,
          emp,
          work_schedule,
          start_date,
          end_date,
        );

        result.push({
          employee_number: emp.employee_number,
          name: emp.name,
          last_name: emp.last_name,
          buffer,
        });
      }

      return result;
    } finally {
      await browser.close();
    }
  }

  private resolvePayableHoursSource(params: {
    isHoliday: boolean;
    holidayMode?: 'schedule' | 'default_8h' | null;
    attendanceSource: AttendanceSource;
    authorizedHours: number;
    payableHours: number;
  }): PayableHoursSource {
    const authorizedHours = this.roundPayroll(params.authorizedHours ?? 0);
    const payableHours = this.roundPayroll(params.payableHours ?? 0);

    if (params.isHoliday) {
      if (params.holidayMode === 'schedule') return 'holiday_schedule';
      if (params.holidayMode === 'default_8h') return 'holiday_default_8h';
    }

    if (!params.attendanceSource && payableHours <= 0) {
      return 'no_attendance_data';
    }

    if (payableHours >= authorizedHours && authorizedHours > 0) {
      return 'master_schedule';
    }

    if (params.attendanceSource === 'time_clock_wizard') {
      return 'time_clock_wizard';
    }

    if (params.attendanceSource === 'activity_report') {
      return 'activity_report';
    }

    return 'master_schedule';
  }

  private buildHolidayFallbackScheduleDetails(params: {
    holidays: Array<{
      id: string;
      name: string;
      date: string;
    }>;
    existingScheduleDetails: Array<{
      date: string;
      [key: string]: any;
    }>;
    baseScheduleDetailsForRate: Array<{
      date: string;
      total_hours: number;
      [key: string]: any;
    }>;
    rates: Array<{
      id: number;
      type: string | null;
      type_of_rate: 'variable' | 'non_variable';
      rate: number;
      startDate: string | null;
      endDate: string | null;
    }>;
  }) {
    const existingDates = new Set(
      (params.existingScheduleDetails || []).map((day) => day.date),
    );

    const defaultHolidayHours = 8;

    return (params.holidays || [])
      .filter((holiday) => holiday?.date && !existingDates.has(holiday.date))
      .map((holiday) => {
        const rateInfo = this.resolveEffectiveRateByDate(
          holiday.date,
          params.rates,
          params.baseScheduleDetailsForRate,
        );

        const periodRate = this.roundPayroll(rateInfo?.period_rate ?? 0);
        const internalRatePerHour = Number(rateInfo?.internal_rate_per_hour ?? 0);
        const ratePerHour = this.roundPayroll(rateInfo?.rate_per_hour ?? 0);
        const payableHours = defaultHolidayHours;
        const dayPayableAmount = this.roundPayroll(
          payableHours * internalRatePerHour,
        );

        return {
          date: holiday.date,
          is_holiday: true,
          holiday_id: holiday.id,
          holiday_name: holiday.name,
          holiday_names: [holiday.name],
          payroll_day: {
            rate_id: rateInfo?.rate_id ?? null,
            type: rateInfo?.type ?? null,
            type_of_rate: rateInfo?.type_of_rate ?? null,
            period_rate: periodRate,
            internal_rate_per_hour: internalRatePerHour,
            rate_per_hour: ratePerHour,
            authorized_hours: payableHours,
            authorized_lunch_hours: 0,
            real_worked_hours: 0,
            real_lunch_hours: 0,
            attendance_source: 'holiday_default_8h',
            payable_hours_source: 'holiday_default_8h',
            payable_hours: payableHours,
            day_payable_amount: dayPayableAmount,
          },
          master_schedule: {
            source: null,
            strict: null,
            shift_start: null,
            shift_end: null,
            lunch_start: null,
            lunch_end: null,
            lunch_total_hours: 0,
            scheduled_hours: payableHours,
            worked_hours: payableHours,
          },
          activity_report: null,
          time_clock_wizard: null,
        };
      })
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  private roundPayroll(value: number | null | undefined): number {
    return Number(Number(value ?? 0).toFixed(2));
  }

  private timeToMinutes(value: string | null | undefined): number | null {
    if (!value) return null;

    const match = value.trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
    if (!match) return null;

    const hours = Number(match[1]);
    const minutes = Number(match[2]);

    if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;

    return (hours * 60) + minutes;
  }

  private resolvePreferredPayrollSource(
    tcwDay: any,
    activityDay: any,
  ): {
    provider: AttendanceSource;
    day: any | null;
  } {
    const hasTcw = Boolean(
      tcwDay &&
      (Number(tcwDay?.worked_hours ?? 0) > 0 ||
        (tcwDay?.shift_start && tcwDay?.shift_end)),
    );

    const hasActivity = Boolean(
      activityDay &&
      (Number(activityDay?.worked_hours ?? 0) > 0 ||
        (activityDay?.shift_start && activityDay?.shift_end)),
    );

    if (hasTcw) {
      return {
        provider: 'time_clock_wizard',
        day: tcwDay,
      };
    }

    if (hasActivity) {
      return {
        provider: 'activity_report',
        day: activityDay,
      };
    }

    return {
      provider: null,
      day: null,
    };
  }

  private overlapMinutes(
    startA: string | null | undefined,
    endA: string | null | undefined,
    startB: string | null | undefined,
    endB: string | null | undefined,
  ): number {
    const aStart = this.timeToMinutes(startA);
    const aEnd = this.timeToMinutes(endA);
    const bStart = this.timeToMinutes(startB);
    const bEnd = this.timeToMinutes(endB);

    if (
      aStart === null ||
      aEnd === null ||
      bStart === null ||
      bEnd === null ||
      aEnd <= aStart ||
      bEnd <= bStart
    ) {
      return 0;
    }

    const start = Math.max(aStart, bStart);
    const end = Math.min(aEnd, bEnd);

    return Math.max(0, end - start);
  }

  private calculatePayableHoursByScheduleRule(params: {
    strict?: boolean | null;
    authorized_hours: number | null | undefined;
    authorized_lunch_hours: number | null | undefined;
    master_shift_start?: string | null;
    master_shift_end?: string | null;
    real_shift_start?: string | null;
    real_shift_end?: string | null;
    real_worked_hours?: number | null | undefined;
    real_lunch_hours?: number | null | undefined;
  }) {
    const authorizedHours = this.roundPayroll(params.authorized_hours ?? 0);
    const authorizedLunchHours = this.roundPayroll(params.authorized_lunch_hours ?? 0);
    const realWorkedHours = this.roundPayroll(params.real_worked_hours ?? 0);
    const realLunchHours = this.roundPayroll(params.real_lunch_hours ?? 0);
    const strict = Boolean(params.strict);

    if (authorizedHours <= 0) {
      return {
        payable_hours: 0,
        late_in_hours: 0,
        early_out_hours: 0,
        extra_lunch_hours: 0,
      };
    }

    if (!strict) {
      return {
        payable_hours: this.roundPayroll(
          Math.min(authorizedHours, realWorkedHours > 0 ? realWorkedHours : 0),
        ),
        late_in_hours: 0,
        early_out_hours: 0,
        extra_lunch_hours: this.roundPayroll(
          Math.max(0, realLunchHours - authorizedLunchHours),
        ),
      };
    }

    const masterStart = this.timeToMinutes(params.master_shift_start);
    const masterEnd = this.timeToMinutes(params.master_shift_end);
    const realStart = this.timeToMinutes(params.real_shift_start);
    const realEnd = this.timeToMinutes(params.real_shift_end);

    const canUseStrictWindow =
      masterStart !== null &&
      masterEnd !== null &&
      realStart !== null &&
      realEnd !== null &&
      masterEnd > masterStart &&
      realEnd > realStart;

    if (!canUseStrictWindow) {
      return {
        payable_hours: this.roundPayroll(
          Math.min(authorizedHours, realWorkedHours > 0 ? realWorkedHours : 0),
        ),
        late_in_hours: 0,
        early_out_hours: 0,
        extra_lunch_hours: this.roundPayroll(
          Math.max(0, realLunchHours - authorizedLunchHours),
        ),
      };
    }

    const lateInMinutes = Math.max(0, realStart - masterStart);
    const earlyOutMinutes = Math.max(0, masterEnd - realEnd);
    const extraLunchHours = Math.max(0, realLunchHours - authorizedLunchHours);

    const payableHours = Math.max(
      0,
      authorizedHours -
      (lateInMinutes / 60) -
      (earlyOutMinutes / 60) -
      extraLunchHours,
    );

    return {
      payable_hours: this.roundPayroll(Math.min(authorizedHours, payableHours)),
      late_in_hours: this.roundPayroll(lateInMinutes / 60),
      early_out_hours: this.roundPayroll(earlyOutMinutes / 60),
      extra_lunch_hours: this.roundPayroll(extraLunchHours),
    };
  }

  private calculateHours(
    start: string | null | undefined,
    end: string | null | undefined,
  ): number {
    if (!start || !end) return 0;

    const startTime = new Date(start).getTime();
    const endTime = new Date(end).getTime();

    if (Number.isNaN(startTime) || Number.isNaN(endTime) || endTime <= startTime) {
      return 0;
    }

    return (endTime - startTime) / (1000 * 60 * 60);
  }

  private parseCsvDate(raw: string): string | null {
    try {
      const d = new Date(raw.trim());
      if (isNaN(d.getTime())) return null;
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
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
          in_favor: entry.in_favor ?? [],
          to_deduct: entry.to_deduct ?? [],
        };
      }
      return map;
    } catch (error) {
      console.error('⚠️  fetchCompensations falló:', error.message);
      return {};
    }
  }

  private sumCommissions(
    items: Array<{
      commission?: number;
    }>,
  ) {
    return Number(
      (items || [])
        .reduce((sum, item) => sum + Number(item.commission ?? 0), 0)
        .toFixed(2),
    );
  }

  private async fetchCommissions(
    employee_numbers: string[],
    start_date: string,
    end_date: string,
  ): Promise<Record<string, any[]>> {
    try {
      const baseUrl = process.env.ACCOUNTING_API;

      const { data } = await axios.post<{
        by_employee: Record<string, any[]>;
      }>(
        `${baseUrl}/commissions/by-employee-range`,
        {
          from: start_date,
          to: end_date,
          employee_numbers,
        },
        { timeout: 10_000 },
      );

      return data?.by_employee ?? {};
    } catch (error) {
      console.error('⚠️ fetchCommissions falló:', error.message);
      return {};
    }
  }

  async parseTimesheetCsv(buffer: Buffer): Promise<{
    employee: string;
    total_hours: number;
  }[]> {
    const content = buffer.toString('utf-8');
    const lines = content.split('\n').map(l => l.trim()).filter(Boolean);
    if (!lines.length) return [];

    const headers = lines[0].split(',').map(h => h.trim());
    const col = (name: string) => headers.indexOf(name);

    const colEmployee = col('Employee');
    const colHourType = col('Hour Type');
    const colDayDate = col('DayDate');
    const colIn = col('In');
    const colOut = col('Out');
    const colHours = col('Hours');
    const colPaidBreak = col('Paid Break');
    const colUnpaidBreak = col('Unpaid Break');
    const colDayWise = col('DayWiseTotalHours');
    const colTotalHours = col('Total Hours');
    const colTotalPaid = col('TotalPaidBreak');
    const colTotalUnpaid = col('TotalUnpaidBreak');
    const colTotalDayWise = col('TotalDaywiseTotalhours');

    if (colEmployee === -1 || colHours === -1) {
      throw new Error('CSV must have "Employee" and "Hours" columns');
    }

    // ── Parser de hora → minutos desde medianoche ────────────────────────────
    const timeToMinutes = (t: string | null): number | null => {
      if (!t || t === '0') return null;
      const m24 = t.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
      if (m24) return parseInt(m24[1]) * 60 + parseInt(m24[2]);
      const m12 = t.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
      if (m12) {
        let h = parseInt(m12[1]);
        const m = parseInt(m12[2]);
        const mer = m12[3].toUpperCase();
        if (mer === 'PM' && h !== 12) h += 12;
        if (mer === 'AM' && h === 12) h = 0;
        return h * 60 + m;
      }
      return null;
    };

    type RawInterval = {
      hour_type: string;
      time_in: string | null;
      time_out: string | null;
      time_in_mins: number | null;
      time_out_mins: number | null;
      hours: number;
      paid_break: number;
      unpaid_break: number;
      day_wise_total_hours: number;
      total_hours: number;
      total_paid_break: number;
      total_unpaid_break: number;
      total_day_wise_total_hours: number;
    };

    // ── 1. Agrupar todos los intervalos por (employee, day_date) ─────────────
    const grouped = new Map<string, {
      employee: string;
      day_date: string;
      intervals: RawInterval[];
    }>();

    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',');
      const employee = cols[colEmployee]?.trim();
      if (!employee) continue;

      const day_date = this.parseCsvDate(cols[colDayDate]?.trim() ?? '');
      if (!day_date) continue;

      const time_in_raw = cols[colIn]?.trim() || null;
      const time_out_raw = cols[colOut]?.trim() || null;
      const time_in = time_in_raw === '0' ? null : time_in_raw;
      const time_out = time_out_raw === '0' ? null : time_out_raw;
      const hours = parseFloat(cols[colHours]?.trim() ?? '0') || 0;

      const key = `${employee}__${day_date}`;
      if (!grouped.has(key)) grouped.set(key, { employee, day_date, intervals: [] });

      grouped.get(key)!.intervals.push({
        hour_type: cols[colHourType]?.trim() || 'Regular',
        time_in,
        time_out,
        time_in_mins: timeToMinutes(time_in),
        time_out_mins: timeToMinutes(time_out),
        hours: Number.isFinite(hours) ? hours : 0,
        paid_break: parseFloat(cols[colPaidBreak]?.trim() ?? '0') || 0,
        unpaid_break: parseFloat(cols[colUnpaidBreak]?.trim() ?? '0') || 0,
        day_wise_total_hours: parseFloat(cols[colDayWise]?.trim() ?? '0') || 0,
        total_hours: parseFloat(cols[colTotalHours]?.trim() ?? '0') || 0,
        total_paid_break: parseFloat(cols[colTotalPaid]?.trim() ?? '0') || 0,
        total_unpaid_break: parseFloat(cols[colTotalUnpaid]?.trim() ?? '0') || 0,
        total_day_wise_total_hours: parseFloat(cols[colTotalDayWise]?.trim() ?? '0') || 0,
      });
    }

    // ── 2. Consolidar cada grupo en una sola fila ────────────────────────────
    const toUpsert: Partial<Timesheet>[] = [];

    for (const [, { employee, day_date, intervals }] of grouped) {

      // Ordenar por time_in ascendente (nulls al final)
      intervals.sort((a, b) => {
        if (a.time_in_mins === null && b.time_in_mins === null) return 0;
        if (a.time_in_mins === null) return 1;
        if (b.time_in_mins === null) return -1;
        return a.time_in_mins - b.time_in_mins;
      });

      const earliestInterval = intervals.find(iv => iv.time_in_mins !== null);
      const latestInterval = [...intervals].reverse().find(iv => iv.time_out_mins !== null);

      // ── LOGICA PARA LUNCH ──
      let lunch_in: string | null = null;
      let lunch_out: string | null = null;
      let lunch_minutes = 0;

      // Si hay 2 o más turnos en el día, calculamos el lunch basado en el primero y el segundo
      if (intervals.length >= 2) {
        lunch_in = intervals[0].time_out; // Salida del primer turno
        lunch_out = intervals[1].time_in; // Entrada del segundo turno

        if (intervals[0].time_out_mins !== null && intervals[1].time_in_mins !== null) {
          lunch_minutes = intervals[1].time_in_mins - intervals[0].time_out_mins;
          // En caso extremo de que el lunch cruce la medianoche (poco probable, pero seguro)
          if (lunch_minutes < 0) lunch_minutes += (24 * 60);
        }
      }
      // ───────────────────────

      const sumHours = parseFloat(intervals.reduce((s, iv) => s + iv.hours, 0).toFixed(2));
      const sumPaid = parseFloat(intervals.reduce((s, iv) => s + iv.paid_break, 0).toFixed(2));
      const sumUnpaid = parseFloat(intervals.reduce((s, iv) => s + iv.unpaid_break, 0).toFixed(2));
      const last = intervals[intervals.length - 1];

      toUpsert.push({
        employee,
        hour_type: intervals[0].hour_type,
        day_date,
        time_in: earliestInterval?.time_in ?? null,
        time_out: latestInterval?.time_out ?? null,
        lunch_in,
        lunch_out,
        lunch_minutes,
        hours: sumHours,
        paid_break: sumPaid,
        unpaid_break: sumUnpaid,
        day_wise_total_hours: sumHours,
        total_hours: last.total_hours,
        total_paid_break: last.total_paid_break,
        total_unpaid_break: last.total_unpaid_break,
        total_day_wise_total_hours: last.total_day_wise_total_hours,
      });
    }

    // ── 3. DELETE → INSERT ───────────────────────────────────────────────────
    if (toUpsert.length) {
      const BATCH_DEL = 100;
      for (let i = 0; i < toUpsert.length; i += BATCH_DEL) {
        const chunk = toUpsert.slice(i, i + BATCH_DEL);
        const conditions = chunk.map((_, idx) => `(employee = :emp${idx} AND day_date = :date${idx})`).join(' OR ');
        const params: Record<string, string> = {};
        chunk.forEach((pair, idx) => {
          params[`emp${idx}`] = pair.employee!;
          params[`date${idx}`] = pair.day_date!;
        });

        await this.timesheetRepository
          .createQueryBuilder()
          .delete()
          .from(Timesheet)
          .where(conditions, params)
          .execute();
      }

      const BATCH_INS = 100;
      for (let i = 0; i < toUpsert.length; i += BATCH_INS) {
        await this.timesheetRepository
          .createQueryBuilder()
          .insert()
          .into(Timesheet)
          .values(toUpsert.slice(i, i + BATCH_INS) as Timesheet[])
          .execute();
      }
    }

    // ── 4. Respuesta ─────────────────────────────────────────────────────────
    const saved = await this.timesheetRepository
      .createQueryBuilder('t')
      .select('t.employee', 'employee')
      .addSelect('SUM(t.hours)', 'total_hours')
      .where('t.hours > 0')
      .groupBy('t.employee')
      .orderBy('t.employee', 'ASC')
      .getRawMany();

    return saved.map(row => ({
      employee: row.employee,
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
          const matches = empTokens.filter(t => csvTokens.includes(t)).length;
          const score = matches / Math.min(empTokens.length, csvTokens.length);
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

  async getPayrollData(
    work_schedule: WorkSchedule,
    start_date: string,
    end_date: string,
  ) {
    try {
      const round = (value: number | null | undefined) =>
        Number(Number(value ?? 0).toFixed(2));

      const buildPayrollHoursSummary = (scheduleDetails: any[]) => {
        const summary = {
          authorized_schedule: {
            work_hours: 0,
            lunch_hours: 0,
            total_hours: 0,
          },
          time_clock_wizard: {
            work_hours: 0,
            lunch_hours: 0,
            total_hours: 0,
          },
          activity_report: {
            work_hours: 0,
            lunch_hours: 0,
            total_hours: 0,
            source_days: {
              one: 0,
              vout: 0,
              none: 0,
            },
          },
        };

        for (const day of scheduleDetails || []) {
          const payrollDay = day?.payroll_day ?? {};
          const masterSchedule = day?.master_schedule ?? {};
          const tcw = day?.time_clock_wizard ?? null;
          const activity = day?.activity_report ?? null;

          const authorizedWork = round(
            payrollDay.authorized_hours ?? masterSchedule.worked_hours ?? 0,
          );
          const authorizedLunch = round(
            payrollDay.authorized_lunch_hours ?? masterSchedule.lunch_total_hours ?? 0,
          );

          summary.authorized_schedule.work_hours += authorizedWork;
          summary.authorized_schedule.lunch_hours += authorizedLunch;

          if (tcw) {
            summary.time_clock_wizard.work_hours += round(tcw.worked_hours ?? 0);
            summary.time_clock_wizard.lunch_hours += round(tcw.lunch_total_hours ?? 0);
          }

          if (activity) {
            summary.activity_report.work_hours += round(activity.worked_hours ?? 0);
            summary.activity_report.lunch_hours += round(activity.lunch_total_hours ?? 0);

            if (activity.source === 'one') {
              summary.activity_report.source_days.one += 1;
            } else if (activity.source === 'vout') {
              summary.activity_report.source_days.vout += 1;
            } else {
              summary.activity_report.source_days.none += 1;
            }
          }
        }

        summary.authorized_schedule.work_hours = round(summary.authorized_schedule.work_hours);
        summary.authorized_schedule.lunch_hours = round(summary.authorized_schedule.lunch_hours);
        summary.authorized_schedule.total_hours = round(
          summary.authorized_schedule.work_hours + summary.authorized_schedule.lunch_hours,
        );

        summary.time_clock_wizard.work_hours = round(summary.time_clock_wizard.work_hours);
        summary.time_clock_wizard.lunch_hours = round(summary.time_clock_wizard.lunch_hours);
        summary.time_clock_wizard.total_hours = round(
          summary.time_clock_wizard.work_hours + summary.time_clock_wizard.lunch_hours,
        );

        summary.activity_report.work_hours = round(summary.activity_report.work_hours);
        summary.activity_report.lunch_hours = round(summary.activity_report.lunch_hours);
        summary.activity_report.total_hours = round(
          summary.activity_report.work_hours + summary.activity_report.lunch_hours,
        );

        return summary;
      };

      const buildRealHoursSummary = (
        employeeNumber: string,
        activityDaily: any,
        tcwDaily: any,
      ) => {
        const summary = {
          time_clock_wizard: {
            work_hours: 0,
            lunch_hours: 0,
            total_hours: 0,
            source_days: 0,
          },
          activity_report: {
            work_hours: 0,
            lunch_hours: 0,
            total_hours: 0,
            source_days: {
              one: 0,
              vout: 0,
              none: 0,
            },
          },
        };

        const tcwRows = Object.values(
          tcwDaily?.by_employee?.[employeeNumber] ?? {},
        ) as any[];

        const activityRows = Object.values(
          activityDaily?.merged_by_employee?.[employeeNumber] ?? {},
        ) as any[];

        for (const row of tcwRows) {
          summary.time_clock_wizard.work_hours += round(row?.worked_hours ?? 0);
          summary.time_clock_wizard.lunch_hours += round(row?.lunch_total_hours ?? 0);
          summary.time_clock_wizard.source_days += 1;
        }

        for (const row of activityRows) {
          summary.activity_report.work_hours += round(row?.worked_hours ?? 0);
          summary.activity_report.lunch_hours += round(row?.lunch_total_hours ?? 0);

          const provider = row?.provider ?? row?.source ?? null;

          if (provider === 'one') {
            summary.activity_report.source_days.one += 1;
          } else if (provider === 'vout') {
            summary.activity_report.source_days.vout += 1;
          } else {
            summary.activity_report.source_days.none += 1;
          }
        }

        summary.time_clock_wizard.work_hours = round(summary.time_clock_wizard.work_hours);
        summary.time_clock_wizard.lunch_hours = round(summary.time_clock_wizard.lunch_hours);
        summary.time_clock_wizard.total_hours = round(
          summary.time_clock_wizard.work_hours +
          summary.time_clock_wizard.lunch_hours,
        );

        summary.activity_report.work_hours = round(summary.activity_report.work_hours);
        summary.activity_report.lunch_hours = round(summary.activity_report.lunch_hours);
        summary.activity_report.total_hours = round(
          summary.activity_report.work_hours +
          summary.activity_report.lunch_hours,
        );

        return summary;
      };

      const employees = await this.employeeRepository.find({
        where: { status: 'Active', work_schedule },
        select: {
          employee_number: true,
          name: true,
          last_name: true,
          work_schedule: true,
          type_of_income: true,
          pay_frequency: true,
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
        },
      });

      const employeeNumbers = employees.map((e) => e.employee_number);
      if (!employeeNumbers.length) return [];

      const events = await this.scheduleEventRepository.find({
        where: {
          date: Between(start_date, end_date),
          register: In([RegisterEnum.TIME_OFF_REQUEST, RegisterEnum.EXTRA_HOURS]),
          schedule: { employee_number: In(employeeNumbers) },
        },
        relations: ['schedule'],
      });

      const eventsByEmployee: Record<
        string,
        {
          timeOffHours: number;
          extraHours: number;
          timeOffCount: number;
          extraHoursCount: number;
          timeOffDetails: Array<{
            date: string;
            start: string;
            end: string;
            total_hours: number;
          }>;
          extraHoursDetails: Array<{
            date: string;
            start: string;
            end: string;
            total_hours: number;
          }>;
        }
      > = {};

      for (const event of events) {
        const empNumber = event.schedule.employee_number;

        if (!eventsByEmployee[empNumber]) {
          eventsByEmployee[empNumber] = {
            timeOffHours: 0,
            extraHours: 0,
            timeOffCount: 0,
            extraHoursCount: 0,
            timeOffDetails: [],
            extraHoursDetails: [],
          };
        }

        if (!event.start || !event.end) {
          continue;
        }

        const rawHours = this.calculateHours(event.start, event.end);
        const formattedStart = this.formatToChicago(event.date, event.start);
        const formattedEnd = this.formatToChicago(event.date, event.end);

        if (event.register === RegisterEnum.TIME_OFF_REQUEST) {
          const appliedHours = Math.min(rawHours, 8);

          eventsByEmployee[empNumber].timeOffHours += appliedHours;
          eventsByEmployee[empNumber].timeOffCount += 1;
          eventsByEmployee[empNumber].timeOffDetails.push({
            date: event.date,
            start: formattedStart,
            end: formattedEnd,
            total_hours: Number(appliedHours.toFixed(2)),
          });
        } else if (event.register === RegisterEnum.EXTRA_HOURS) {
          eventsByEmployee[empNumber].extraHours += rawHours;
          eventsByEmployee[empNumber].extraHoursCount += 1;
          eventsByEmployee[empNumber].extraHoursDetails.push({
            date: event.date,
            start: formattedStart,
            end: formattedEnd,
            total_hours: Number(rawHours.toFixed(2)),
          });
        }
      }

      const masterSchedules = await this.scheduleRepo.find({
        where: { employee_number: In(employeeNumbers) },
        relations: ['fixed', 'events'],
      });

      const scheduleMap = new Map(
        masterSchedules.map((schedule) => [schedule.employee_number, schedule]),
      );

      const empList = employees.map((e) => ({
        employee_number: e.employee_number,
        name: e.name,
        last_name: e.last_name,
      }));

      const [
        advancedByEmployee,
        activityDaily,
        tcwDaily,
        holidaysInRange,
        compensationMap,
        ratesMap,
        commissionsMap,
      ] = await Promise.all([
        this.fetchAdvancedRequests(start_date, end_date),
        this.fetchActivityReportDailyData(empList, start_date, end_date),
        this.fetchTcwDailyData(empList, start_date, end_date),
        this.fetchHolidaysInRange(start_date, end_date),
        this.fetchCompensations(employeeNumbers, start_date, end_date),
        this.fetchRatesByDateRange(start_date, end_date),
        this.fetchCommissions(employeeNumbers, start_date, end_date),
      ]);

      const holidaysNormalized = holidaysInRange.map((holiday) => ({
        id: holiday.id,
        name: holiday.name,
        date: holiday.date,
      }));

      const result = employees.map((emp) => {
        const employeeNumber = emp.employee_number;
        const master = scheduleMap.get(employeeNumber);
        const metrics = this.calculateMasterMetrics(master, start_date, end_date);
        const rawRates = ratesMap.get(employeeNumber) || [];

        const effective_rates = this.buildEffectiveRates(
          metrics.daily_details || [],
          rawRates,
        );

        const enrichedScheduleDetails = this.enrichScheduleDetailsWithRate(
          metrics.daily_details || [],
          rawRates,
        );

        const scheduleDetailsWithHolidayFlag = this.markScheduleDetailsAsHoliday(
          enrichedScheduleDetails,
          holidaysNormalized,
        );

        const totalAuthorizedHoursForPeriod = Number(
          metrics.total_authorized_hours ?? 0,
        );

        let schedule_details = scheduleDetailsWithHolidayFlag.map((day) => {
          const currentDay: any = day;

          const activityDay =
            activityDaily.merged_by_employee?.[employeeNumber]?.[currentDay.date] ??
            null;

          const tcwDay =
            tcwDaily.by_employee?.[employeeNumber]?.[currentDay.date] ?? null;

          const authorizedHours = round(currentDay.total_hours ?? 0);
          const authorizedLunchHours = round(currentDay.lunch_hours ?? 0);

          const preferredSource = this.resolvePreferredPayrollSource(
            tcwDay,
            activityDay,
          );

          const attendanceSource: AttendanceSource = preferredSource.provider;

          const selectedRealDay = preferredSource.day;

          const realWorkedHours = round(selectedRealDay?.worked_hours ?? 0);
          const realLunchHours = round(selectedRealDay?.lunch_total_hours ?? 0);

          const internalRatePerHour =
            totalAuthorizedHoursForPeriod > 0
              ? Number(currentDay.period_rate ?? 0) / totalAuthorizedHoursForPeriod
              : 0;

          const displayRatePerHour = round(currentDay.rate_per_hour ?? 0);

          let payableHours = 0;

          // HOLIDAY con schedule:
          // no depende de TCW ni Activity, se paga lo autorizado por schedule
          if (currentDay.is_holiday) {
            payableHours = authorizedHours;
          } else {
            const payableMeta = this.calculatePayableHoursByScheduleRule({
              strict: currentDay.strict ?? false,
              authorized_hours: authorizedHours,
              authorized_lunch_hours: authorizedLunchHours,
              master_shift_start: currentDay.start ?? null,
              master_shift_end: currentDay.end ?? null,
              real_shift_start: selectedRealDay?.shift_start ?? null,
              real_shift_end: selectedRealDay?.shift_end ?? null,
              real_worked_hours: realWorkedHours,
              real_lunch_hours: realLunchHours,
            });

            payableHours = round(payableMeta.payable_hours);
          }

          const dayPayableAmount = round(payableHours * internalRatePerHour);

          const masterScheduledHours = round(
            Number(currentDay.total_hours ?? 0) +
            Number(currentDay.lunch_hours ?? 0),
          );

          const {
            start,
            end,
            source,
            strict,
            lunch_start,
            lunch_end,
            lunch_hours,
            total_hours,
            calculated_total,
            internal_rate_per_hour,
            day_payable_amount,
            rate_id,
            type,
            type_of_rate,
            period_rate,
            rate_per_hour,
            ...restDay
          } = currentDay;

          return {
            ...restDay,
            payroll_day: {
              rate_id: rate_id ?? null,
              type: type ?? null,
              type_of_rate: type_of_rate ?? null,
              period_rate: round(period_rate ?? 0),
              internal_rate_per_hour: internalRatePerHour,
              rate_per_hour: displayRatePerHour,
              authorized_hours: authorizedHours,
              authorized_lunch_hours: authorizedLunchHours,
              real_worked_hours: realWorkedHours,
              real_lunch_hours: realLunchHours,
              attendance_source: currentDay.is_holiday
                ? 'holiday_schedule'
                : ((attendanceSource ?? 'none') as AttendanceSourceOutput),

              payable_hours_source: this.resolvePayableHoursSource({
                isHoliday: Boolean(currentDay.is_holiday),
                holidayMode: currentDay.is_holiday ? 'schedule' : null,
                attendanceSource,
                authorizedHours,
                payableHours,
              }),
              payable_hours: payableHours,
              day_payable_amount: dayPayableAmount,
            },
            master_schedule: {
              source: source ?? null,
              strict: strict ?? null,
              shift_start: start ?? null,
              shift_end: end ?? null,
              lunch_start: lunch_start ?? null,
              lunch_end: lunch_end ?? null,
              lunch_total_hours: round(lunch_hours ?? 0),
              scheduled_hours: masterScheduledHours,
              worked_hours: authorizedHours,
            },
            activity_report: activityDay
              ? {
                source: activityDay.provider ?? null,
                employee_name: activityDay.employee_name ?? null,
                shift_start: activityDay.shift_start ?? null,
                shift_end: activityDay.shift_end ?? null,
                lunch_start: activityDay.lunch_start ?? null,
                lunch_end: activityDay.lunch_end ?? null,
                lunch_total_hours: round(activityDay.lunch_total_hours ?? 0),
                scheduled_hours: round(activityDay.scheduled_hours ?? 0),
                worked_hours: round(activityDay.worked_hours ?? 0),
              }
              : null,
            time_clock_wizard: tcwDay
              ? {
                employee_name: tcwDay.employee_name ?? null,
                shift_start: tcwDay.shift_start ?? null,
                shift_end: tcwDay.shift_end ?? null,
                lunch_start: tcwDay.lunch_start ?? null,
                lunch_end: tcwDay.lunch_end ?? null,
                lunch_total_hours: round(tcwDay.lunch_total_hours ?? 0),
                scheduled_hours: round(tcwDay.scheduled_hours ?? 0),
                worked_hours: round(tcwDay.worked_hours ?? 0),
                records_count: Number(tcwDay.records_count ?? 0),
                missing_clock_out: Boolean(tcwDay.missing_clock_out),
              }
              : null,
          };
        });

        const holidayFallbackDetails = this.buildHolidayFallbackScheduleDetails({
          holidays: holidaysNormalized,
          existingScheduleDetails: schedule_details,
          baseScheduleDetailsForRate: metrics.daily_details || [],
          rates: rawRates,
        });

        schedule_details = [...schedule_details, ...holidayFallbackDetails].sort(
          (a, b) => a.date.localeCompare(b.date),
        );

        const enrichedTimeOffDetails = this.enrichEventDetailsWithRate(
          eventsByEmployee[employeeNumber]?.timeOffDetails ?? [],
          rawRates,
          metrics.daily_details || [],
          schedule_details,
        );

        const enrichedExtraHoursDetails = this.enrichEventDetailsWithRate(
          eventsByEmployee[employeeNumber]?.extraHoursDetails ?? [],
          rawRates,
          metrics.daily_details || [],
          schedule_details,
        );

        const enrichedHolidays = this.enrichHolidaysWithRate(
          holidaysNormalized,
          rawRates,
          metrics.daily_details || [],
        );

        const payrollHoursSummary = buildPayrollHoursSummary(schedule_details);
        const realHoursSummary = buildRealHoursSummary(
          employeeNumber,
          activityDaily,
          tcwDaily,
        );

        const days_amount = round(
          (schedule_details || []).reduce(
            (sum, day) => sum + Number(day?.payroll_day?.day_payable_amount ?? 0),
            0,
          ),
        );

        const time_off_amount = round(
          -this.sumCalculatedTotals(enrichedTimeOffDetails),
        );

        const extra_hours_amount = round(
          this.sumCalculatedTotals(enrichedExtraHoursDetails),
        );

        const compensations_in_favor_amount = this.sumCompensations(
          compensationMap[employeeNumber]?.in_favor ?? [],
        );

        const compensations_to_deduct_amount = round(
          -this.sumCompensations(
            compensationMap[employeeNumber]?.to_deduct ?? [],
          ),
        );

        const commissions_amount = this.sumCommissions(
          commissionsMap[employeeNumber] ?? [],
        );

        const advanced_amount = round(
          -(advancedByEmployee[employeeNumber]?.total_advanced ?? 0),
        );

        const total_payroll_amount = round(
          days_amount +
          time_off_amount +
          extra_hours_amount +
          compensations_in_favor_amount +
          compensations_to_deduct_amount +
          commissions_amount +
          advanced_amount,
        );

        return {
          ...emp,
          authorized_hours: metrics.total_authorized_hours,
          period: {
            start_date,
            end_date,
          },
          days_worked: metrics.days_worked_count,
          schedule_details,
          effective_rates,
          time_off: {
            total_requests: eventsByEmployee[employeeNumber]?.timeOffCount ?? 0,
            total_hours: round(eventsByEmployee[employeeNumber]?.timeOffHours ?? 0),
            details: enrichedTimeOffDetails,
          },
          extra_hours: {
            total_requests: eventsByEmployee[employeeNumber]?.extraHoursCount ?? 0,
            total_hours: round(eventsByEmployee[employeeNumber]?.extraHours ?? 0),
            details: enrichedExtraHoursDetails,
          },
          advanced_requests: {
            total_requests:
              advancedByEmployee[employeeNumber]?.requests_count ?? 0,
            total_amount: round(
              advancedByEmployee[employeeNumber]?.total_advanced ?? 0,
            ),
            details: advancedByEmployee[employeeNumber]?.details ?? [],
          },
          holidays_in_range: enrichedHolidays,
          compensation_summary: {
            in_favor: compensationMap[employeeNumber]?.in_favor ?? [],
            to_deduct: compensationMap[employeeNumber]?.to_deduct ?? [],
          },
          commissions_summary: commissionsMap[employeeNumber] ?? [],
          payroll_totals: {
            schedule_summary_hours: payrollHoursSummary,
            real_summary_hours: realHoursSummary,
            days_amount,
            time_off_amount,
            extra_hours_amount,
            compensations_in_favor_amount,
            compensations_to_deduct_amount,
            commissions_amount,
            advanced_amount,
            total_payroll_amount,
          },
        };
      });

      return result;
    } catch (error) {
      console.error('Error en getPayrollData:', error);

      if (error instanceof BadRequestException) {
        throw error;
      }

      throw new InternalServerErrorException(
        `Error al obtener datos de payroll: ${error.message}`,
      );
    }
  }

  private markScheduleDetailsAsHoliday(
    scheduleDetails: Array<{
      date: string;
      start: string;
      end: string;
      source: string;
      strict?: boolean | null;
      lunch_start?: string | null;
      lunch_end?: string | null;
      lunch_hours: number;
      total_hours: number;
      rate_id?: number | null;
      type?: string | null;
      type_of_rate?: 'variable' | 'non_variable' | null;
      period_rate?: number;
      rate_per_hour?: number;
      calculated_total?: number;
      [key: string]: any;
    }>,
    holidays: Array<{
      id: string;
      name: string;
      date: string;
    }>,
  ) {
    const holidaysByDate = new Map<
      string,
      Array<{
        id: string;
        name: string;
        date: string;
      }>
    >();

    for (const holiday of holidays || []) {
      if (!holiday?.date) continue;

      if (!holidaysByDate.has(holiday.date)) {
        holidaysByDate.set(holiday.date, []);
      }

      holidaysByDate.get(holiday.date)!.push({
        id: holiday.id,
        name: holiday.name,
        date: holiday.date,
      });
    }

    return (scheduleDetails || []).map((day) => {
      const matchedHolidays = holidaysByDate.get(day.date) || [];

      return {
        ...day,
        is_holiday: matchedHolidays.length > 0,
        holiday_id: matchedHolidays.length ? matchedHolidays[0].id : null,
        holiday_name: matchedHolidays.length ? matchedHolidays[0].name : null,
        holiday_names: matchedHolidays.map((h) => h.name),
      };
    });
  }


  private buildPayableDayBreakdown(
    effectiveRates: Array<{
      rate_id: number;
      type: string | null;
      type_of_rate: 'variable' | 'non_variable';
      period_rate: number;
      range_start: string | null;
      range_end: string | null;
      authorized_hours: number;
      rate_per_hour: number;
    }>,
    authorizedHours: number,
    tcwHours: number | null,
  ) {
    const totalAuthorizedHours = Number(authorizedHours ?? 0);
    const totalTcwHours = Number(tcwHours ?? 0);

    const payableHours = Number(
      Math.min(totalTcwHours > 0 ? totalTcwHours : 0, totalAuthorizedHours).toFixed(2),
    );

    if (!effectiveRates?.length || totalAuthorizedHours <= 0 || payableHours <= 0) {
      return {
        payable_hours: payableHours,
        breakdown: [],
        total_days_amount: 0,
      };
    }

    const breakdown = effectiveRates.map((item) => {
      const authorizedHoursInPeriod = Number(item.authorized_hours ?? 0);
      const weight =
        totalAuthorizedHours > 0 ? authorizedHoursInPeriod / totalAuthorizedHours : 0;

      const payableHoursInPeriod = Number((payableHours * weight).toFixed(2));
      const calculatedPayment = Number(
        (payableHoursInPeriod * Number(item.rate_per_hour ?? 0)).toFixed(2),
      );

      return {
        rate_id: item.rate_id,
        type: item.type,
        type_of_rate: item.type_of_rate,
        period_rate: Number(item.period_rate ?? 0),
        range_start: item.range_start,
        range_end: item.range_end,
        authorized_hours: Number(authorizedHoursInPeriod.toFixed(2)),
        payable_hours: payableHoursInPeriod,
        rate_per_hour: Number(Number(item.rate_per_hour ?? 0).toFixed(2)),
        calculated_payment: calculatedPayment,
      };
    });

    const totalDaysAmount = Number(
      breakdown.reduce((sum, item) => sum + Number(item.calculated_payment ?? 0), 0).toFixed(2),
    );

    return {
      payable_hours: payableHours,
      breakdown,
      total_days_amount: totalDaysAmount,
    };
  }

  private sumCalculatedTotals(items: Array<{ calculated_total?: number }>) {
    return Number(
      (items || [])
        .reduce((sum, item) => sum + Number(item.calculated_total ?? 0), 0)
        .toFixed(2),
    );
  }

  private sumCompensations(
    items: Array<{
      amount?: number;
      installment?: {
        amount?: number;
      } | null;
    }>,
  ) {
    return Number(
      (items || [])
        .reduce((sum, item) => {
          const value =
            item?.installment?.amount != null
              ? Number(item.installment.amount)
              : Number(item.amount ?? 0);

          return sum + value;
        }, 0)
        .toFixed(2),
    );
  }

  private resolveEffectiveRateByDate(
    workDate: string,
    rates: Array<{
      id: number;
      type: string | null;
      type_of_rate: 'variable' | 'non_variable';
      rate: number;
      startDate: string | null;
      endDate: string | null;
    }>,
    scheduleDetails: Array<{
      date: string;
      total_hours: number;
      [key: string]: any;
    }>,
  ) {
    const matchedRate = this.resolveRateForDate(workDate, rates);

    if (!matchedRate) {
      return null;
    }

    const totalAuthorizedHours = Number(
      (scheduleDetails || [])
        .reduce((sum, day) => sum + Number(day.total_hours ?? 0), 0)
        .toFixed(2),
    );

    const periodRate = Number(matchedRate.rate ?? 0);
    const internalRatePerHour =
      totalAuthorizedHours > 0
        ? periodRate / totalAuthorizedHours
        : 0;

    return {
      rate_id: matchedRate.id,
      type: matchedRate.type,
      type_of_rate: matchedRate.type_of_rate,
      period_rate: Number(periodRate.toFixed(2)),
      range_start: matchedRate.startDate,
      range_end: matchedRate.endDate,
      total_authorized_hours: totalAuthorizedHours,

      // solo para cálculo interno
      internal_rate_per_hour: internalRatePerHour,

      // solo para mostrar en API
      rate_per_hour: Number(internalRatePerHour.toFixed(2)),
    };
  }

  private enrichScheduleDetailsWithRate(
    scheduleDetails: Array<{
      date: string;
      start: string;
      end: string;
      source: string;
      lunch_hours: number;
      total_hours: number;
      [key: string]: any;
    }>,
    rates: Array<{
      id: number;
      type: string | null;
      type_of_rate: 'variable' | 'non_variable';
      rate: number;
      startDate: string | null;
      endDate: string | null;
    }>,
  ) {
    return (scheduleDetails || []).map((day) => {
      const rateInfo = this.resolveEffectiveRateByDate(day.date, rates, scheduleDetails);

      return {
        ...day,
        rate_id: rateInfo?.rate_id ?? null,
        type: rateInfo?.type ?? null,
        type_of_rate: rateInfo?.type_of_rate ?? null,
        period_rate: rateInfo?.period_rate ?? 0,
        rate_per_hour: rateInfo?.rate_per_hour ?? 0,
        calculated_total: Number(
          (Number(day.total_hours ?? 0) * Number(rateInfo?.rate_per_hour ?? 0)).toFixed(2),
        ),
      };
    });
  }

  private enrichEventDetailsWithRate(
    details: Array<{
      date: string;
      start: string;
      end: string;
      total_hours: number;
      [key: string]: any;
    }>,
    rates: Array<{
      id: number;
      type: string | null;
      type_of_rate: 'variable' | 'non_variable';
      rate: number;
      startDate: string | null;
      endDate: string | null;
    }>,
    scheduleDetails: Array<{
      date: string;
      total_hours: number;
      [key: string]: any;
    }>,
    scheduleDetailsWithPayroll: Array<{
      date: string;
      payroll_day?: {
        rate_id?: number | null;
        type?: string | null;
        type_of_rate?: 'variable' | 'non_variable' | null;
        period_rate?: number;
        internal_rate_per_hour?: number;
        rate_per_hour?: number;
      } | null;
      [key: string]: any;
    }> = [],
  ) {
    return (details || []).map((item) => {
      const matchedScheduleDay = (scheduleDetailsWithPayroll || []).find(
        (day) => day.date === item.date,
      );

      const payrollDay = matchedScheduleDay?.payroll_day ?? null;

      const fallbackRateInfo = this.resolveEffectiveRateByDate(
        item.date,
        rates,
        scheduleDetails,
      );

      const hours = Number(item.total_hours ?? 0);

      const rate_id = payrollDay?.rate_id ?? fallbackRateInfo?.rate_id ?? null;
      const type = payrollDay?.type ?? fallbackRateInfo?.type ?? null;
      const type_of_rate =
        payrollDay?.type_of_rate ?? fallbackRateInfo?.type_of_rate ?? null;

      const period_rate = Number(
        payrollDay?.period_rate ?? fallbackRateInfo?.period_rate ?? 0,
      );

      // ESTA ES LA IMPORTANTE PARA CÁLCULO CONTABLE
      const internal_rate_per_hour = Number(
        payrollDay?.internal_rate_per_hour ??
        fallbackRateInfo?.internal_rate_per_hour ??
        0,
      );

      // ESTA ES SOLO PARA MOSTRAR EN RESPUESTA
      const rate_per_hour = Number(
        payrollDay?.rate_per_hour ?? fallbackRateInfo?.rate_per_hour ?? 0,
      );

      return {
        ...item,
        rate_id,
        type,
        type_of_rate,
        period_rate,
        internal_rate_per_hour,
        rate_per_hour,
        calculated_total: Number((hours * internal_rate_per_hour).toFixed(2)),
      };
    });
  }

  private enrichHolidaysWithRate(
    holidays: Array<{
      id: string;
      name: string;
      date: string;
      [key: string]: any;
    }>,
    rates: Array<{
      id: number;
      type: string | null;
      type_of_rate: 'variable' | 'non_variable';
      rate: number;
      startDate: string | null;
      endDate: string | null;
    }>,
    scheduleDetails: Array<{
      date: string;
      total_hours: number;
      [key: string]: any;
    }>,
  ) {
    return (holidays || []).map((holiday) => {
      const rateInfo = this.resolveEffectiveRateByDate(holiday.date, rates, scheduleDetails);
      const matchedDay = (scheduleDetails || []).find((d) => d.date === holiday.date);
      const hours = Number(matchedDay?.total_hours ?? 0);

      return {
        ...holiday,
        total_hours: hours,
        rate_id: rateInfo?.rate_id ?? null,
        type: rateInfo?.type ?? null,
        type_of_rate: rateInfo?.type_of_rate ?? null,
        period_rate: rateInfo?.period_rate ?? 0,
        rate_per_hour: rateInfo?.rate_per_hour ?? 0,
        calculated_total: Number((hours * (rateInfo?.rate_per_hour ?? 0)).toFixed(2)),
      };
    });
  }

  private async fetchRatesByDateRange(start_date: string, end_date: string) {
    const baseUrl = process.env.ACCOUNTING_API;

    if (!baseUrl) {
      throw new InternalServerErrorException('ACCOUNTING_API is not defined');
    }

    try {
      const response = await axios.get(`${baseUrl}/rate-season/range`, {
        params: {
          startDate: start_date,
          endDate: end_date,
        },
      });

      const rows = response?.data?.data ?? [];

      const ratesMap = new Map<
        string,
        Array<{
          id: number;
          type: string | null;
          type_of_rate: 'variable' | 'non_variable';
          rate: number;
          startDate: string | null;
          endDate: string | null;
        }>
      >();

      for (const row of rows) {
        const employeeNumber = row.employeeNumber;
        if (!employeeNumber) continue;

        const rates = Array.isArray(row.rates)
          ? row.rates.map((r: any) => ({
            id: Number(r.id),
            type: r.type ?? null,
            type_of_rate: r.type_of_rate,
            rate: Number(r.rate ?? 0),
            startDate: r.startDate ?? null,
            endDate: r.endDate ?? null,
          }))
          : [];

        ratesMap.set(employeeNumber, rates);
      }

      return ratesMap;
    } catch (error: any) {
      throw new InternalServerErrorException(
        `Error fetching rate seasons from ACCOUNTING_API: ${error.message}`,
      );
    }
  }

  private resolveRateForDate(
    workDate: string,
    rates: Array<{
      id: number;
      type: string | null;
      type_of_rate: 'variable' | 'non_variable';
      rate: number;
      startDate: string | null;
      endDate: string | null;
    }>,
  ) {
    if (!Array.isArray(rates) || rates.length === 0) {
      return null;
    }

    const variableMatch = rates.find((rate) => {
      if (rate.type_of_rate !== 'variable') return false;
      if (!rate.startDate || !rate.endDate) return false;

      return workDate >= rate.startDate && workDate <= rate.endDate;
    });

    if (variableMatch) {
      return variableMatch;
    }

    const fixedMatch = rates.find((rate) => rate.type_of_rate === 'non_variable');
    return fixedMatch || null;
  }

  private buildEffectiveRates(
    scheduleDetails: Array<{
      date: string;
      total_hours: number;
      [key: string]: any;
    }>,
    rates: Array<{
      id: number;
      type: string | null;
      type_of_rate: 'variable' | 'non_variable';
      rate: number;
      startDate: string | null;
      endDate: string | null;
    }>,
  ) {
    const totalAuthorizedHours = Number(
      (scheduleDetails || [])
        .reduce((sum, day) => sum + Number(day.total_hours ?? 0), 0)
        .toFixed(2),
    );

    const grouped = new Map<
      string,
      {
        rate_id: number;
        type: string | null;
        type_of_rate: 'variable' | 'non_variable';
        period_rate: number;
        range_start: string | null;
        range_end: string | null;
        authorized_hours: number;
        rate_per_hour_raw: number;
      }
    >();

    for (const day of scheduleDetails || []) {
      const workDate = day.date;
      const dayHours = Number(day.total_hours ?? 0);

      if (!workDate || dayHours <= 0) continue;

      const matchedRate = this.resolveRateForDate(workDate, rates);
      if (!matchedRate) continue;

      const key = String(matchedRate.id);

      if (!grouped.has(key)) {
        const periodRate = Number(matchedRate.rate ?? 0);

        grouped.set(key, {
          rate_id: matchedRate.id,
          type: matchedRate.type,
          type_of_rate: matchedRate.type_of_rate,
          period_rate: periodRate,
          range_start: matchedRate.startDate,
          range_end: matchedRate.endDate,
          authorized_hours: 0,
          rate_per_hour_raw:
            totalAuthorizedHours > 0
              ? periodRate / totalAuthorizedHours
              : 0,
        });
      }

      const current = grouped.get(key)!;
      current.authorized_hours += dayHours;
    }

    return Array.from(grouped.values()).map((item) => ({
      rate_id: item.rate_id,
      type: item.type,
      type_of_rate: item.type_of_rate,
      period_rate: Number(item.period_rate.toFixed(2)),
      range_start: item.range_start,
      range_end: item.range_end,
      authorized_hours: Number(item.authorized_hours.toFixed(2)),
      rate_per_hour_raw: item.rate_per_hour_raw,
      rate_per_hour: Number(item.rate_per_hour_raw.toFixed(4)),
    }));
  }

  private buildRateBreakdown(
    scheduleDetails: Array<{
      date: string;
      total_hours: number;
      [key: string]: any;
    }>,
    rates: Array<{
      id: number;
      type: string | null;
      type_of_rate: 'variable' | 'non_variable';
      rate: number;
      startDate: string | null;
      endDate: string | null;
    }>,
  ) {
    const breakdownMap = new Map<
      string,
      {
        rate_id: number;
        type: string | null;
        type_of_rate: 'variable' | 'non_variable';
        rate_per_hour: number;
        range_start: string | null;
        range_end: string | null;
        authorized_hours: number;
        subtotal: number;
      }
    >();

    for (const day of scheduleDetails || []) {
      const workDate = day.date;
      const authorizedHours = Number(day.total_hours ?? 0);

      if (!workDate || authorizedHours <= 0) continue;

      const matchedRate = this.resolveRateForDate(workDate, rates);
      if (!matchedRate) continue;

      const key = String(matchedRate.id);

      if (!breakdownMap.has(key)) {
        breakdownMap.set(key, {
          rate_id: matchedRate.id,
          type: matchedRate.type,
          type_of_rate: matchedRate.type_of_rate,
          rate_per_hour: Number(matchedRate.rate ?? 0),
          range_start: matchedRate.startDate,
          range_end: matchedRate.endDate,
          authorized_hours: 0,
          subtotal: 0,
        });
      }

      const current = breakdownMap.get(key)!;
      current.authorized_hours += authorizedHours;
      current.subtotal += authorizedHours * current.rate_per_hour;
    }

    return Array.from(breakdownMap.values()).map((item) => ({
      ...item,
      authorized_hours: Number(item.authorized_hours.toFixed(2)),
      subtotal: Number(item.subtotal.toFixed(2)),
    }));
  }

  // ---------------------------------------------------------
  // FUNCIONES PRIVADAS DE APOYO (Agrega estas debajo de getPayrollData)
  // ---------------------------------------------------------

  private calculateMasterMetrics(schedule: EmployeeSchedule | undefined, start: string, end: string) {
    let totalHours = 0;
    let daysWorked = 0;

    const dailyDetails: Array<{
      date: string;
      start: string;
      end: string;
      source: string;
      strict?: boolean | null;
      lunch_start?: string | null;
      lunch_end?: string | null;
      lunch_hours: number;
      total_hours: number;
    }> = [];

    if (!schedule) {
      return {
        total_authorized_hours: 0,
        days_worked_count: 0,
        daily_details: [],
      };
    }

    const startDate = new Date(`${start}T00:00:00`);
    const endDate = new Date(`${end}T00:00:00`);

    const diffTime = Math.abs(endDate.getTime() - startDate.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    for (let i = 0; i <= diffDays; i++) {
      const currentDay = new Date(startDate);
      currentDay.setDate(currentDay.getDate() + i);

      const dateStr = currentDay.toISOString().split('T')[0];
      const dayOfWeek = currentDay.getDay();

      let hoursToday = 0;
      let lunchDeducted = 0;
      let source = '';
      let shiftStart = '';
      let shiftEnd = '';
      let strict: boolean | null = null;
      let lunchStart: string | null = null;
      let lunchEnd: string | null = null;

      const eventShift = schedule.events?.find(
        (e) => e.date === dateStr && e.register === RegisterEnum.WORK_SHIFT,
      );
      const eventLunch = schedule.events?.find(
        (e) => e.date === dateStr && e.register === RegisterEnum.LUNCH,
      );

      if (eventShift?.start && eventShift?.end) {
        const rawHours = this.calculateHours(eventShift.start, eventShift.end);

        const hasEventLunch = Boolean(eventLunch?.start && eventLunch?.end);

        lunchDeducted = hasEventLunch
          ? Number(this.calculateHours(eventLunch!.start, eventLunch!.end).toFixed(2))
          : 0;

        hoursToday = Math.max(0, rawHours - lunchDeducted);
        shiftStart = this.formatToChicago(dateStr, eventShift.start);
        shiftEnd = this.formatToChicago(dateStr, eventShift.end);
        lunchStart = hasEventLunch
          ? this.formatToChicago(dateStr, eventLunch!.start)
          : null;
        lunchEnd = hasEventLunch
          ? this.formatToChicago(dateStr, eventLunch!.end)
          : null;

        source = 'Event';
        strict = null;
      } else {
        const fixedShift = schedule.fixed?.find(
          (f) => f.weekdays.includes(dayOfWeek) && f.register === 'Work Shift',
        );
        const fixedLunch = schedule.fixed?.find(
          (f) => f.weekdays.includes(dayOfWeek) && f.register === 'Lunch',
        );

        if (fixedShift) {
          const rawHours = this.calculateTimeDiff(fixedShift.start, fixedShift.end);
          lunchDeducted = fixedLunch
            ? Number(this.calculateTimeDiff(fixedLunch.start, fixedLunch.end).toFixed(2))
            : 0;

          hoursToday = Math.max(0, rawHours - lunchDeducted);
          shiftStart = fixedShift.start;
          shiftEnd = fixedShift.end;
          lunchStart = fixedLunch?.start ?? null;
          lunchEnd = fixedLunch?.end ?? null;
          source = 'Fixed';
          strict = fixedShift.strict ?? null;
        }
      }

      if (source !== '') {
        totalHours += hoursToday;
        daysWorked++;

        dailyDetails.push({
          date: dateStr,
          start: shiftStart,
          end: shiftEnd,
          source,
          strict,
          lunch_start: lunchStart,
          lunch_end: lunchEnd,
          lunch_hours: Number(lunchDeducted.toFixed(2)),
          total_hours: Number(hoursToday.toFixed(2)),
        });
      }
    }

    return {
      total_authorized_hours: Number(totalHours.toFixed(2)),
      days_worked_count: daysWorked,
      daily_details: dailyDetails,
    };
  }

  // Parsea un Timestamp (Eventos) o un Time string puro (Fixed) a hora de Chicago 24h
  private formatToChicago(
    dateStr: string,
    timeValue: string | null | undefined,
  ): string {
    if (!timeValue) return '';

    let dateObj = new Date(timeValue);

    if (isNaN(dateObj.getTime())) {
      dateObj = new Date(`${dateStr}T${timeValue}Z`);
    }

    return dateObj.toLocaleTimeString('en-GB', {
      timeZone: 'America/Chicago',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
  }

  private calculateTimeDiff(startTime: string, endTime: string): number {
    const s = new Date(`1970-01-01T${startTime}Z`);
    const e = new Date(`1970-01-01T${endTime}Z`);
    return (e.getTime() - s.getTime()) / (1000 * 60 * 60);
  }

  /*  async generatePayrollPdf(
     work_schedule: WorkSchedule,
     start_date: string,
     end_date: string,
   ): Promise<Buffer> {
     const data = await this.getPayrollData(work_schedule, start_date, end_date);
 
     const browser = await puppeteer.launch({
       headless: true,
       args: ['--no-sandbox', '--disable-setuid-sandbox'],
     });
 
     try {
       const page = await browser.newPage();
 
       // DESACTIVAR TIMEOUTS POR DEFECTO PARA EVITAR EL ERROR DE 30000ms
       page.setDefaultNavigationTimeout(0);
       page.setDefaultTimeout(0);
 
       const mergedPdf = await PDFDocument.create();
 
       for (const emp of data) {
         // Obtenemos el HTML de UNO SOLO usando la nueva función
         const html = buildSingleEmployeeHtml(emp, work_schedule, start_date, end_date);
 
         // Esperamos a que el DOM cargue, sin limite de tiempo
         await page.setContent(html, { waitUntil: 'load', timeout: 0 });
 
         // Calculamos cuánto midió exactamente ese HTML
         const contentHeight = await page.evaluate(() => {
           const container = document.getElementById('report-container');
           return container ? container.offsetHeight : document.body.scrollHeight;
         });
 
         const finalHeight = contentHeight + 40; // 40px de margen inferior
 
         // Generamos el PDF individual a la medida exacta
         const pdfBuffer = await page.pdf({
           width: '800px',
           height: `${finalHeight}px`,
           printBackground: true,
           margin: { top: '0', bottom: '0', left: '0', right: '0' },
           timeout: 0
         });
 
         // Hacemos Merge a nuestro documento maestro
         const tempPdf = await PDFDocument.load(pdfBuffer);
         const [copiedPage] = await mergedPdf.copyPages(tempPdf, [0]);
         mergedPdf.addPage(copiedPage);
       }
 
       const finalPdfBytes = await mergedPdf.save();
       return Buffer.from(finalPdfBytes);
 
     } finally {
       await browser.close();
     }
   } */

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
  ): Promise<Record<string, { total_advanced: number; requests_count: number; details: any[] }>> {
    try {
      const baseUrl = process.env.ACCOUNTING_API;
      // Hacemos el fetch al endpoint filter que me pasaste
      const { data } = await axios.get<any[]>(`${baseUrl}/advanced-request/filter`, {
        params: { status: 'Processed', processed_from: start_date, processed_to: end_date },
        timeout: 8_000,
      });

      const byEmployee: Record<string, { total_advanced: number; requests_count: number; details: any[] }> = {};

      for (const req of data) {
        const empNum = req.employee_data?.employee_number;
        if (!empNum) continue;

        if (!byEmployee[empNum]) {
          byEmployee[empNum] = { total_advanced: 0, requests_count: 0, details: [] };
        }

        const amountStr = req.amount ?? 0;
        const amountNum = parseFloat(amountStr);

        byEmployee[empNum].total_advanced += amountNum;
        byEmployee[empNum].requests_count += 1;

        // Guardamos los detalles de esta solicitud específica
        byEmployee[empNum].details.push({
          id: req.id,
          date: req.date, // Fecha solicitada
          amount: Number(amountNum.toFixed(2)),
          payment_type: req.payment_type,
          processed_date: req.processed_status?.date,
          processed_time: req.processed_status?.time
        });
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
          total_hours: row.total_hours,
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
        const rowNorm = norm(row.employee_name ?? '');
        const empNumber = nameToNumber.get(rowNorm);

        console.log(`VOUT row: "${row.employee_name}" → norm: "${rowNorm}" → emp: ${empNumber ?? '❌ NO MATCH'}`);

        if (!empNumber) continue;

        map[empNumber] = {
          total_hours: row.total_hours,
          total_minutes: row.total_minutes,
        };
      }

      return map;
    } catch (error) {
      console.error('⚠️  fetchWorkHoursActivityReport falló:', error.message);
      return {};
    }
  }

  private round2(value: number | string | null | undefined): number {
    return Number((Number(value ?? 0) || 0).toFixed(2));
  }

  private normalizeName(value: string | null | undefined): string {
    return String(value ?? '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private tokenizeName(value: string | null | undefined): string[] {
    return this.normalizeName(value).split(/\s+/).filter(Boolean);
  }

  private pickFirst<T = any>(row: any, keys: string[], fallback: T | null = null): T | null {
    for (const key of keys) {
      const value = row?.[key];
      if (value !== undefined && value !== null && String(value).trim() !== '') {
        return value as T;
      }
    }
    return fallback;
  }

  private toClockString(value: any, dateStr?: string): string | null {
    if (value === undefined || value === null) return null;

    const raw = String(value).trim();
    if (!raw || raw === '0' || raw.toLowerCase() === 'null') return null;

    // 24h HH:mm:ss
    if (/^\d{1,2}:\d{2}:\d{2}$/.test(raw)) return raw;

    // 24h HH:mm
    if (/^\d{1,2}:\d{2}$/.test(raw)) return `${raw}:00`;

    // 12h: "9:00 AM", "6:15 PM", "06:15:30 PM"
    const m12 = raw.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)$/i);
    if (m12) {
      let h = parseInt(m12[1]);
      const min = m12[2];
      const sec = m12[3] ?? '00';
      const mer = m12[4].toUpperCase();
      if (mer === 'PM' && h !== 12) h += 12;
      if (mer === 'AM' && h === 12) h = 0;
      return `${h.toString().padStart(2, '0')}:${min}:${sec}`;
    }

    // ISO timestamp
    const dateObj = new Date(raw);
    if (!isNaN(dateObj.getTime())) {
      if (dateStr) return this.formatToChicago(dateStr, raw);
      return dateObj.toISOString().slice(11, 19);
    }

    return null;
  }

  private diffHoursFromClocks(start: string | null | undefined, end: string | null | undefined): number {
    const startMin = this.timeToMinutes(start);
    const endMin = this.timeToMinutes(end);

    if (startMin === null || endMin === null) return 0;

    let diff = endMin - startMin;
    if (diff < 0) diff += 24 * 60;

    return this.round2(diff / 60);
  }

  private findBestEmployeeNumberFromName(
    employees: Array<{ employee_number: string; name: string; last_name: string }>,
    targetName: string | null | undefined,
  ): string | null {
    const targetTokens = this.tokenizeName(targetName);
    if (!targetTokens.length) return null;

    let bestEmployeeNumber: string | null = null;
    let bestScore = 0;

    for (const emp of employees) {
      const variants = [
        `${emp.name} ${emp.last_name}`,
        `${emp.last_name} ${emp.name}`,
        `${String(emp.name || '').split(/\s+/)[0] || ''} ${String(emp.last_name || '').split(/\s+/)[0] || ''}`,
        `${String(emp.last_name || '').split(/\s+/)[0] || ''} ${String(emp.name || '').split(/\s+/)[0] || ''}`,
      ];

      let scoreForEmp = 0;
      for (const variant of variants) {
        const tokens = this.tokenizeName(variant);
        const matches = tokens.filter((t) => targetTokens.includes(t)).length;
        const score = tokens.length && targetTokens.length
          ? matches / Math.min(tokens.length, targetTokens.length)
          : 0;
        if (score > scoreForEmp) scoreForEmp = score;
      }

      if (scoreForEmp > bestScore) {
        bestScore = scoreForEmp;
        bestEmployeeNumber = emp.employee_number;
      }
    }

    return bestScore >= 0.75 ? bestEmployeeNumber : null;
  }

  private async fetchActivityReportDailyData(
    employees: Array<{ employee_number: string; name: string; last_name: string }>,
    start_date: string,
    end_date: string,
  ): Promise<{
    merged_by_employee: Record<string, Record<string, any>>;
    totals_one: Record<string, { total_hours: number; total_minutes: number }>;
    totals_vout: Record<string, { total_hours: number; total_minutes: number }>;
  }> {
    const oneByEmployee: Record<string, Record<string, any>> = {};
    const voutByEmployee: Record<string, Record<string, any>> = {};

    const isEmptyLike = (value: any): boolean => {
      if (value === undefined || value === null) return true;
      const raw = String(value).trim().toLowerCase();
      return (
        raw === '' ||
        raw === '0' ||
        raw === 'null' ||
        raw === 'undefined' ||
        raw === 'n/a' ||
        raw === 'na' ||
        raw === 'none' ||
        raw === 'no lunch' ||
        raw === 'no clock in' ||
        raw === 'no clock out'
      );
    };

    const toSafeClock = (value: any, date: string): string | null => {
      if (isEmptyLike(value)) return null;
      return this.toClockString(value, date);
    };

    const buildTotals = (
      source: Record<string, Record<string, any>>,
    ): Record<string, { total_hours: number; total_minutes: number }> => {
      const totals: Record<string, { total_hours: number; total_minutes: number }> = {};

      Object.entries(source).forEach(([employeeNumber, days]) => {
        const totalHours = this.round2(
          Object.values(days).reduce(
            (sum: number, row: any) => sum + Number(row?.worked_hours ?? 0),
            0,
          ),
        );

        totals[employeeNumber] = {
          total_hours: totalHours,
          total_minutes: Math.round(totalHours * 60),
        };
      });

      return totals;
    };

    const upsertActivityRow = (
      target: Record<string, Record<string, any>>,
      provider: 'one' | 'vout',
      row: any,
    ) => {
      const date = this.pickFirst<string>(row, ['date', 'day_date', 'work_date']);
      if (!date) return;

      const rawEmployeeNumber =
        provider === 'one'
          ? this.pickFirst<string>(row, ['employee_number'])
          : null;

      const rawEmployeeName = this.pickFirst<string>(row, [
        'employee_name',
        'full_name',
        'employee',
        'name',
      ]);

      const employeeNumber =
        rawEmployeeNumber ||
        this.findBestEmployeeNumberFromName(employees, rawEmployeeName);

      if (!employeeNumber) return;

      const shiftStart = toSafeClock(
        this.pickFirst(row, ['clock_in', 'time_in', 'in', 'shift_start']),
        date,
      );

      const shiftEnd = toSafeClock(
        this.pickFirst(row, ['clock_out', 'time_out', 'out', 'shift_end']),
        date,
      );

      const lunchStart = toSafeClock(
        this.pickFirst(row, ['lunch_in', 'lunch_start']),
        date,
      );

      const lunchEnd = toSafeClock(
        this.pickFirst(row, ['lunch_out', 'lunch_end']),
        date,
      );

      const rawLunchMinutes = this.pickFirst<number | string>(
        row,
        ['lunch_minutes', 'total_lunch_minutes'],
        null,
      );

      const lunchHours =
        rawLunchMinutes !== null
          ? this.round2(Number(rawLunchMinutes) / 60)
          : this.diffHoursFromClocks(lunchStart, lunchEnd);

      const explicitWorkedHours = this.pickFirst<number | string>(
        row,
        [
          'net_work_hours',
          'worked_hours',
          'total_hours',
          'hours',
          'work_hours',
        ],
        null,
      );

      const explicitWorkedMinutes = this.pickFirst<number | string>(
        row,
        [
          'net_work_minutes',
          'worked_minutes',
          'total_minutes',
          'work_minutes',
        ],
        null,
      );

      const workedHours =
        explicitWorkedHours !== null
          ? this.round2(Number(explicitWorkedHours))
          : explicitWorkedMinutes !== null
            ? this.round2(Number(explicitWorkedMinutes) / 60)
            : this.round2(
              Math.max(0, this.diffHoursFromClocks(shiftStart, shiftEnd) - lunchHours),
            );

      const shiftSpanHours = this.diffHoursFromClocks(shiftStart, shiftEnd);

      const scheduledHours = this.round2(
        Math.max(
          shiftSpanHours,
          workedHours + lunchHours,
        ),
      );

      if (!target[employeeNumber]) {
        target[employeeNumber] = {};
      }

      const current = target[employeeNumber][date] ?? {
        provider,
        employee_name: rawEmployeeName ?? null,
        shift_start: null,
        shift_end: null,
        lunch_start: null,
        lunch_end: null,
        lunch_total_hours: 0,
        scheduled_hours: 0,
        worked_hours: 0,
      };

      if (!current.shift_start) {
        current.shift_start = shiftStart;
      } else {
        const currentStartMin = this.timeToMinutes(current.shift_start);
        const newStartMin = this.timeToMinutes(shiftStart);
        if (
          currentStartMin !== null &&
          newStartMin !== null &&
          newStartMin < currentStartMin
        ) {
          current.shift_start = shiftStart;
        }
      }

      if (!current.shift_end) {
        current.shift_end = shiftEnd;
      } else {
        const currentEndMin = this.timeToMinutes(current.shift_end);
        const newEndMin = this.timeToMinutes(shiftEnd);
        if (
          currentEndMin !== null &&
          newEndMin !== null &&
          newEndMin > currentEndMin
        ) {
          current.shift_end = shiftEnd;
        }
      }

      if (!current.lunch_start) {
        current.lunch_start = lunchStart;
      } else {
        const currentLunchStartMin = this.timeToMinutes(current.lunch_start);
        const newLunchStartMin = this.timeToMinutes(lunchStart);
        if (
          currentLunchStartMin !== null &&
          newLunchStartMin !== null &&
          newLunchStartMin < currentLunchStartMin
        ) {
          current.lunch_start = lunchStart;
        }
      }

      if (!current.lunch_end) {
        current.lunch_end = lunchEnd;
      } else {
        const currentLunchEndMin = this.timeToMinutes(current.lunch_end);
        const newLunchEndMin = this.timeToMinutes(lunchEnd);
        if (
          currentLunchEndMin !== null &&
          newLunchEndMin !== null &&
          newLunchEndMin > currentLunchEndMin
        ) {
          current.lunch_end = lunchEnd;
        }
      }

      current.provider = provider;
      current.employee_name = rawEmployeeName ?? current.employee_name ?? null;
      current.lunch_total_hours = this.round2(
        Math.max(Number(current.lunch_total_hours ?? 0), lunchHours),
      );
      current.worked_hours = this.round2(
        Math.max(Number(current.worked_hours ?? 0), workedHours),
      );
      current.scheduled_hours = this.round2(
        Math.max(
          Number(current.scheduled_hours ?? 0),
          scheduledHours,
          Number(current.worked_hours ?? 0) + Number(current.lunch_total_hours ?? 0),
        ),
      );

      target[employeeNumber][date] = current;
    };

    try {
      const baseUrl = process.env.ACTIVITY_REPORT_ONE_API;
      const { data } = await axios.post(
        `${baseUrl}/new-activity/clock-report/data`,
        { start_date, end_date },
        { timeout: 15_000 },
      );

      for (const row of data?.data ?? []) {
        upsertActivityRow(oneByEmployee, 'one', row);
      }
    } catch (error) {
      console.error('⚠️ Activity ONE clock-report/data failed:', error.message);
    }

    try {
      const baseUrl = process.env.VOUT_API;
      const { data } = await axios.post(
        `${baseUrl}/activity_report/clock-report/data`,
        { start_date, end_date },
        { timeout: 15_000 },
      );

      for (const row of data?.data ?? []) {
        upsertActivityRow(voutByEmployee, 'vout', row);
      }
    } catch (error) {
      console.error('⚠️ Activity VOUT clock-report/data failed:', error.message);
    }

    const mergedByEmployee: Record<string, Record<string, any>> = {};

    for (const emp of employees) {
      const employeeNumber = emp.employee_number;

      const dates = new Set([
        ...Object.keys(oneByEmployee[employeeNumber] ?? {}),
        ...Object.keys(voutByEmployee[employeeNumber] ?? {}),
      ]);

      if (!dates.size) continue;

      mergedByEmployee[employeeNumber] = {};

      for (const date of dates) {
        mergedByEmployee[employeeNumber][date] =
          voutByEmployee[employeeNumber]?.[date] ??
          oneByEmployee[employeeNumber]?.[date] ??
          null;
      }
    }

    return {
      merged_by_employee: mergedByEmployee,
      totals_one: buildTotals(oneByEmployee),
      totals_vout: buildTotals(voutByEmployee),
    };
  }

  private async fetchTcwDailyData(
    employees: Array<{ employee_number: string; name: string; last_name: string }>,
    start_date: string,
    end_date: string,
  ): Promise<{
    by_employee: Record<string, Record<string, any>>;
    totals: Record<string, { total_hours: number }>;
  }> {
    try {
      const rows = await this.timesheetRepository
        .createQueryBuilder('t')
        .where('t.day_date >= :start_date::date', { start_date })
        .andWhere('t.day_date <= :end_date::date', { end_date })
        .orderBy('t.day_date', 'ASC')
        .addOrderBy('t.employee', 'ASC')
        .addOrderBy('t.time_in', 'ASC')
        .getMany();

      const byEmployee: Record<string, Record<string, any>> = {};
      const totals: Record<string, { total_hours: number }> = {};

      const toNumber = (value: any): number => {
        const n = Number(value);
        return Number.isFinite(n) ? n : 0;
      };

      const normalizeDate = (value: any): string | null => {
        if (!value) return null;
        if (typeof value === 'string') return value.slice(0, 10);

        const d = new Date(value);
        if (Number.isNaN(d.getTime())) return null;

        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        return `${yyyy}-${mm}-${dd}`;
      };

      const safeClock = (value: any, date: string): string | null => {
        if (value === null || value === undefined || value === '') return null;
        return this.toClockString(value, date);
      };

      const betterMinClock = (current: string | null, incoming: string | null): string | null => {
        if (!incoming) return current;
        if (!current) return incoming;

        const currentMin = this.timeToMinutes(current);
        const incomingMin = this.timeToMinutes(incoming);

        if (currentMin === null) return incoming;
        if (incomingMin === null) return current;

        return incomingMin < currentMin ? incoming : current;
      };

      const betterMaxClock = (current: string | null, incoming: string | null): string | null => {
        if (!incoming) return current;
        if (!current) return incoming;

        const currentMin = this.timeToMinutes(current);
        const incomingMin = this.timeToMinutes(incoming);

        if (currentMin === null) return incoming;
        if (incomingMin === null) return current;

        return incomingMin > currentMin ? incoming : current;
      };

      for (const row of rows) {
        const employeeNumber = this.findBestEmployeeNumberFromName(employees, row.employee);
        if (!employeeNumber) continue;

        const date = normalizeDate(row.day_date);
        if (!date) continue;

        if (!byEmployee[employeeNumber]) {
          byEmployee[employeeNumber] = {};
        }

        const timeIn = safeClock(row.time_in, date);
        const timeOut = safeClock(row.time_out, date);
        const lunchIn = safeClock(row.lunch_in, date);
        const lunchOut = safeClock(row.lunch_out, date);

        // SOLO usar columnas diarias reales de la entity.
        // NO usar total_hours, total_day_wise_total_hours, total_unpaid_break, etc.
        // porque esas son acumuladas del periodo y contaminan cada día.
        const workedHoursFromRow = this.round2(
          Math.max(
            toNumber(row.hours),
            toNumber(row.day_wise_total_hours),
          ),
        );

        const lunchHoursFromMinutes = this.round2(toNumber(row.lunch_minutes) / 60);
        const lunchHoursFromBreak = this.round2(toNumber(row.unpaid_break));
        const lunchHoursFromClocks = this.diffHoursFromClocks(lunchIn, lunchOut);

        const lunchHours =
          lunchHoursFromMinutes > 0
            ? lunchHoursFromMinutes
            : lunchHoursFromClocks > 0
              ? lunchHoursFromClocks
              : lunchHoursFromBreak;

        const shiftSpanHours = this.diffHoursFromClocks(timeIn, timeOut);

        const workedHours =
          workedHoursFromRow > 0
            ? workedHoursFromRow
            : shiftSpanHours > 0
              ? this.round2(Math.max(0, shiftSpanHours - lunchHours))
              : 0;

        const scheduledHours = this.round2(
          Math.max(
            shiftSpanHours,
            workedHours + lunchHours,
          ),
        );

        const current = byEmployee[employeeNumber][date] ?? {
          employee_name: row.employee ?? null,
          shift_start: null,
          shift_end: null,
          lunch_start: null,
          lunch_end: null,
          lunch_total_hours: 0,
          scheduled_hours: 0,
          worked_hours: 0,
          records_count: 0,
          missing_clock_out: false,
        };

        current.employee_name = row.employee ?? current.employee_name ?? null;
        current.shift_start = betterMinClock(current.shift_start, timeIn);
        current.shift_end = betterMaxClock(current.shift_end, timeOut);
        current.lunch_start = betterMinClock(current.lunch_start, lunchIn);
        current.lunch_end = betterMaxClock(current.lunch_end, lunchOut);

        // Como normalmente ya existe una fila consolidada por empleado/día,
        // aquí tomamos el mejor valor del día y evitamos inflar totales.
        current.lunch_total_hours = this.round2(
          Math.max(toNumber(current.lunch_total_hours), lunchHours),
        );

        current.worked_hours = this.round2(
          Math.max(toNumber(current.worked_hours), workedHours),
        );

        current.scheduled_hours = this.round2(
          Math.max(
            toNumber(current.scheduled_hours),
            scheduledHours,
            toNumber(current.worked_hours) + toNumber(current.lunch_total_hours),
          ),
        );

        current.records_count += 1;
        current.missing_clock_out =
          current.missing_clock_out || (!!timeIn && !timeOut);

        byEmployee[employeeNumber][date] = current;
      }

      Object.entries(byEmployee).forEach(([employeeNumber, days]) => {
        totals[employeeNumber] = {
          total_hours: this.round2(
            Object.values(days).reduce(
              (sum: number, row: any) => sum + Number(row?.worked_hours ?? 0),
              0,
            ),
          ),
        };
      });

      return { by_employee: byEmployee, totals };
    } catch (error) {
      console.error('⚠️ fetchTcwDailyData falló:', error.message);
      return { by_employee: {}, totals: {} };
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
      .getMany();

    let activityOneData: any[] = [];
    try {
      const baseUrl = process.env.ACTIVITY_REPORT_ONE_API;
      const { data } = await axios.post(
        `${baseUrl}/new-activity/clock-report/data`,
        { start_date, end_date },
        { timeout: 15_000 },
      );
      activityOneData = data?.data ?? [];
    } catch (error) {
      console.error('⚠️ Activity ONE clock-report/data failed:', error.message);
    }

    let activityVoutData: any[] = [];
    try {
      const baseUrl = process.env.VOUT_API;
      const { data } = await axios.post(
        `${baseUrl}/activity_report/clock-report/data`,
        { start_date, end_date },
        { timeout: 15_000 },
      );
      activityVoutData = data?.data ?? [];
    } catch (error) {
      console.error('⚠️ Activity VOUT clock-report/data failed:', error.message);
    }

    const norm = (s: string) =>
      s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();

    const tokenize = (s: string) => norm(s).split(/\s+/).filter(Boolean);

    const matchScore = (a: string, b: string): number => {
      const ta = tokenize(a); const tb = tokenize(b);
      if (!ta.length || !tb.length) return 0;
      return ta.filter(t => tb.includes(t)).length / Math.min(ta.length, tb.length);
    };

    const formatTo24Hours = (t: string | null): string => {
      if (!t || t === '—' || t.toLowerCase().includes('no clock') || t.toLowerCase().includes('no lunch')) return t || '—';
      const match = t.trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM|am|pm)?$/);
      if (!match) return t;

      let h = parseInt(match[1], 10);
      const m = match[2];
      const mer = match[4]?.toUpperCase();

      if (mer === 'PM' && h !== 12) h += 12;
      if (mer === 'AM' && h === 12) h = 0;

      return `${h.toString().padStart(2, '0')}:${m}${match[3] ? `:${match[3]}` : ''}`;
    };

    const parseTimeToMinutes = (t: string | null): number | null => {
      if (!t || t === '—' || t.toLowerCase().includes('no clock') || t.toLowerCase().includes('no lunch')) return null;
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

    const actOneIndex = new Map<string, Map<string, any>>();
    const actVoutIndex = new Map<string, Map<string, any>>();

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

    const findEntry = (index: Map<string, Map<string, any>>, tcwName: string, date: string) => {
      let bestKey = ''; let bestScore = 0;
      for (const [n] of index) {
        const s = matchScore(tcwName, n);
        if (s > bestScore) { bestScore = s; bestKey = n; }
      }
      if (bestKey && bestScore >= 0.75) return index.get(bestKey)?.get(date) ?? null;
      return null;
    };

    const rows: any[] = [];

    for (const r of tcwRecords) {
      const tcwName = r.employee;
      const date = r.day_date;

      const totalHours = parseFloat(String(r.hours ?? 0));
      const tcwIn = formatTo24Hours(r.time_in);
      const tcwOut = formatTo24Hours(r.time_out);

      let tcwLunchIn = 'No lunch';
      let tcwLunchOut = 'No lunch';
      let tcwLunchMins = Number(r.lunch_minutes) || 0;

      // ── AQUÍ: Corrección del default warning ──
      let tcwLunchWarning = '— Not registered';

      if (r.lunch_in && r.lunch_out) {
        tcwLunchIn = formatTo24Hours(r.lunch_in);
        tcwLunchOut = formatTo24Hours(r.lunch_out);
        tcwLunchWarning = tcwLunchMins > 60 ? '⚠️ Lunch exceeded 60 min' : '✅ OK';
      }

      const oneEntry = findEntry(actOneIndex, tcwName, date);
      const voutEntry = findEntry(actVoutIndex, tcwName, date);
      const matchedEntry = voutEntry ?? oneEntry ?? null;
      const matchSource = voutEntry ? 'Activity VOUT' : oneEntry ? 'Activity ONE' : '—';

      const matchedIn = matchedEntry ? parseTimeToMinutes(matchedEntry.clock_in) : null;
      const matchedOut = matchedEntry ? parseTimeToMinutes(matchedEntry.clock_out) : null;

      let matchedHours = '—';
      if (matchedEntry && matchedEntry.net_work_hours != null) {
        matchedHours = Number(matchedEntry.net_work_hours).toFixed(2);
      }

      const actLunchIn = matchedEntry?.lunch_start && matchedEntry.lunch_start !== 'No lunch' ? matchedEntry.lunch_start : '—';
      const actLunchOut = matchedEntry?.lunch_end && matchedEntry.lunch_end !== 'No lunch' ? matchedEntry.lunch_end : '—';
      const actLunchMins = matchedEntry?.lunch_minutes ?? 0;
      let actLunchWarning = '—';

      // ── AQUÍ: Corrección del default warning ──
      if (matchedEntry) {
        if (actLunchIn === '—' || actLunchMins === 0) {
          actLunchWarning = '— Not registered';
        } else if (actLunchMins > 60) {
          actLunchWarning = '⚠️ Lunch exceeded 60 min';
        } else {
          actLunchWarning = '✅ OK';
        }
      }

      const tcwInMins = parseTimeToMinutes(tcwIn);
      let inDiffMins: number | null = null; let inDiffStr = '—';
      if (tcwInMins !== null && matchedIn !== null) {
        inDiffMins = matchedIn - tcwInMins;
        inDiffStr = Math.abs(inDiffMins) > 3 ? `⚠️ ${diffLabel(inDiffMins)}` : `✅ ${diffLabel(inDiffMins)}`;
      }

      const tcwOutMins = parseTimeToMinutes(tcwOut);
      let outDiffMins: number | null = null; let outDiffStr = '—';
      if (tcwOutMins !== null && matchedOut !== null) {
        outDiffMins = matchedOut - tcwOutMins;
        outDiffStr = Math.abs(outDiffMins) > 3 ? `⚠️ ${diffLabel(outDiffMins)}` : `✅ ${diffLabel(outDiffMins)}`;
      }

      const actLunchInMins = parseTimeToMinutes(actLunchIn);
      const actLunchOutMins = parseTimeToMinutes(actLunchOut);
      const parsedTcwLunchInMins = parseTimeToMinutes(tcwLunchIn);
      const parsedTcwLunchOutMins = parseTimeToMinutes(tcwLunchOut);

      let lunchInDiffMins: number | null = null; let lunchInDiffStr = '—';
      let lunchOutDiffMins: number | null = null; let lunchOutDiffStr = '—';
      let lunchDiffStatus = '— NO DATA';

      if (!matchedEntry) {
        lunchDiffStatus = '— NO DATA';
      } else {
        const tcwHasLunch = parsedTcwLunchInMins !== null;
        const actHasLunch = actLunchInMins !== null;

        if (!tcwHasLunch && !actHasLunch) {
          lunchInDiffStr = '—';
          lunchInDiffMins = null;
          lunchOutDiffStr = '—';
          lunchOutDiffMins = null;
          lunchDiffStatus = '— NO DATA';
        } else if (tcwHasLunch && !actHasLunch) {
          lunchInDiffStr = '⚠️ Missing in Activity';
          lunchOutDiffStr = '⚠️ Missing in Activity';
          lunchDiffStatus = '⚠️ REVIEW REQUIRED';
        } else if (!tcwHasLunch && actHasLunch) {
          lunchInDiffStr = '⚠️ Missing in TCW';
          lunchOutDiffStr = '⚠️ Missing in TCW';
          lunchDiffStatus = '⚠️ REVIEW REQUIRED';
        } else {
          lunchInDiffMins = actLunchInMins! - parsedTcwLunchInMins!;
          lunchInDiffStr = Math.abs(lunchInDiffMins) > 3 ? `⚠️ ${diffLabel(lunchInDiffMins)}` : `✅ ${diffLabel(lunchInDiffMins)}`;

          lunchOutDiffMins = actLunchOutMins! - parsedTcwLunchOutMins!;
          lunchOutDiffStr = Math.abs(lunchOutDiffMins) > 3 ? `⚠️ ${diffLabel(lunchOutDiffMins)}` : `✅ ${diffLabel(lunchOutDiffMins)}`;

          lunchDiffStatus = Math.abs(lunchInDiffMins) > 3 || Math.abs(lunchOutDiffMins) > 3 ? '⚠️ REVIEW REQUIRED' : '✅ OK';
        }
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

      const tcwClockOutStatus = tcwOut === '—' ? '🟠 Missing Clock Out in TCW — Please verify and correct the missing Clock Out entry.' : '✅ OK';
      const hasInWarning = inDiffMins !== null && Math.abs(inDiffMins) > 3;
      const hasOutWarning = outDiffMins !== null && Math.abs(outDiffMins) > 3;
      const hasAnyData = inDiffMins !== null || outDiffMins !== null;
      const clockDiffStatus = !hasAnyData ? '— NO DATA' : hasInWarning || hasOutWarning ? '⚠️ REVIEW REQUIRED' : '✅ OK';

      rows.push({
        date,
        tcw_employee: tcwName,
        tcw_clock_in: tcwIn,
        tcw_clock_out: tcwOut,
        tcw_clock_out_status: tcwClockOutStatus,
        tcw_hours: parseFloat(totalHours.toFixed(2)).toString(),
        tcw_lunch_in: tcwLunchIn,
        tcw_lunch_out: tcwLunchOut,
        tcw_lunch_minutes: `${tcwLunchMins} min`,
        tcw_lunch_warning: tcwLunchWarning,
        activity_employee: matchedEntry?.employee_name ?? '—',
        activity_total_hours: matchedHours,
        activity_clock_in: matchedEntry?.clock_in ?? '—',
        in_diff: inDiffStr,
        activity_clock_out: matchedEntry?.clock_out ?? '—',
        out_diff: outDiffStr,
        activity_status: clockOutLabel,
        activity_lunch_in: actLunchIn,
        lunch_in_diff: lunchInDiffStr,
        activity_lunch_out: actLunchOut,
        lunch_out_diff: lunchOutDiffStr,
        activity_lunch_minutes: matchedEntry ? `${actLunchMins} min` : '—',
        activity_lunch_warning: actLunchWarning,
        match_source: matchSource,
        match_result: matchedEntry ? '✅ Match found' : '⚠️ No match found',
        clock_diff_status: clockDiffStatus,
        lunch_diff_status: lunchDiffStatus,
        _in_diff_mins: inDiffMins,
        _out_diff_mins: outDiffMins,
        _lunch_in_diff_mins: lunchInDiffMins,
        _lunch_out_diff_mins: lunchOutDiffMins,
        _has_warning: clockOutLabel.startsWith('🟠'),
        _has_no_match: !matchedEntry,
        _has_tcw_missing_clock_out: tcwOut === '—',
      });
    }

    const colKeys = [
      'date', 'tcw_employee', 'tcw_clock_in', 'tcw_clock_out', 'tcw_clock_out_status', 'tcw_hours',
      'tcw_lunch_in', 'tcw_lunch_out', 'tcw_lunch_minutes', 'tcw_lunch_warning',
      'activity_employee', 'activity_total_hours', 'activity_clock_in', 'in_diff',
      'activity_clock_out', 'out_diff', 'activity_status',
      'activity_lunch_in', 'lunch_in_diff', 'activity_lunch_out', 'lunch_out_diff', 'activity_lunch_minutes', 'activity_lunch_warning',
      'match_source', 'match_result', 'clock_diff_status', 'lunch_diff_status',
    ];

    const headers = [
      'Date', 'TCW — Employee', 'TCW — Clock In', 'TCW — Clock Out', 'TCW — Clock Out Status', 'TCW — Hours',
      'TCW — Lunch In', 'TCW — Lunch Out', 'TCW — Lunch Mins', 'TCW — Lunch Status',
      'Activity — Employee', 'Activity — Total Hrs', 'Activity — Clock In', '⚡ In Diff',
      'Activity — Clock Out', '⚡ Out Diff', 'Activity — Status',
      'Activity — Lunch In', '⚡ L-In Diff', 'Activity — Lunch Out', '⚡ L-Out Diff', 'Activity — Lunch Mins', 'Activity — Lunch Status',
      '📌 Source', 'Match Result', '⚡ Clock Diff Status', '⚡ Lunch Diff Status',
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
      width: finalWidths[i],
    }));

    const TOTAL_COLS = colKeys.length;

    const applyBorder = (cell: ExcelJS.Cell) => {
      cell.border = {
        top: { style: 'thin', color: { argb: 'FF000000' } },
        left: { style: 'thin', color: { argb: 'FF000000' } },
        bottom: { style: 'thin', color: { argb: 'FF000000' } },
        right: { style: 'thin', color: { argb: 'FF000000' } },
      };
    };

    const headerFills: Record<number, string> = {
      1: 'FF1A2C4E',
      2: 'FF2E5090', 3: 'FF2E5090', 4: 'FF2E5090', 5: 'FF2E5090', 6: 'FF2E5090', 7: 'FF2E5090', 8: 'FF2E5090', 9: 'FF2E5090', 10: 'FF2E5090',
      11: 'FF1565C0', 12: 'FF1565C0', 13: 'FF1565C0', 14: 'FF0D47A1', 15: 'FF1565C0', 16: 'FF0D47A1', 17: 'FF1565C0',
      18: 'FF1565C0', 19: 'FF0D47A1', 20: 'FF1565C0', 21: 'FF0D47A1', 22: 'FF1565C0', 23: 'FF1565C0',
      24: 'FF4A148C', 25: 'FF37474F', 26: 'FF7D4F00', 27: 'FF7D4F00',
    };

    const headerRow = ws.getRow(1);
    headerRow.height = 26;

    for (let c = 1; c <= TOTAL_COLS; c++) {
      const cell = headerRow.getCell(c);
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: headerFills[c] ?? 'FF1A2C4E' } };
      applyBorder(cell);
    }

    const setWarningCell = (cell: ExcelJS.Cell, value: string) => {
      if (value.includes('⚠️') || value.includes('Missing')) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF3CD' } };
        cell.font = { bold: true, color: { argb: 'FFB45309' }, size: 10 };
      } else if (value.includes('✅')) {
        cell.font = { color: { argb: 'FF27AE60' }, size: 10 };
      } else {
        cell.font = { color: { argb: 'FFAAAAAA' }, size: 10 };
      }
    }

    for (const row of rows) {
      const { _in_diff_mins, _out_diff_mins, _lunch_in_diff_mins, _lunch_out_diff_mins, _has_warning, _has_no_match, _has_tcw_missing_clock_out, ...rowData } = row;
      const excelRow = ws.addRow(rowData);
      excelRow.height = 24;

      for (let c = 1; c <= TOTAL_COLS; c++) {
        const cell = excelRow.getCell(c);
        cell.alignment = { vertical: 'middle', wrapText: false };
        applyBorder(cell);
      }

      for (let c = 2; c <= 10; c++) {
        excelRow.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F4FF' } };
      }

      const col5 = excelRow.getCell(5);
      if (_has_tcw_missing_clock_out) {
        col5.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFDE8E8' } };
        col5.font = { bold: true, color: { argb: 'FFC0392B' }, size: 10 };
        col5.alignment = { vertical: 'middle', wrapText: true };
      } else {
        col5.font = { color: { argb: 'FF27AE60' }, size: 10 };
      }

      setWarningCell(excelRow.getCell(10), row.tcw_lunch_warning);
      setWarningCell(excelRow.getCell(23), row.activity_lunch_warning);

      const sourceCell = excelRow.getCell(24);
      if (row.match_source === 'Activity ONE') sourceCell.font = { bold: true, color: { argb: 'FF1565C0' }, size: 10 };
      if (row.match_source === 'Activity VOUT') sourceCell.font = { bold: true, color: { argb: 'FF4A148C' }, size: 10 };

      setWarningCell(excelRow.getCell(14), row.in_diff);
      setWarningCell(excelRow.getCell(16), row.out_diff);
      setWarningCell(excelRow.getCell(19), row.lunch_in_diff);
      setWarningCell(excelRow.getCell(21), row.lunch_out_diff);

      if (_has_warning) {
        const col15 = excelRow.getCell(15);
        col15.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFDE8E8' } };
        col15.font = { bold: true, color: { argb: 'FFC0392B' }, size: 10 };

        const col17 = excelRow.getCell(17);
        col17.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFDE8E8' } };
        col17.font = { bold: true, color: { argb: 'FFC0392B' }, size: 10 };
        col17.alignment = { vertical: 'middle', wrapText: true };
      }

      if (_has_no_match) {
        const matchCell = excelRow.getCell(25);
        matchCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF3CD' } };
        matchCell.font = { bold: true, color: { argb: 'FF856404' }, size: 10 };

        for (let c = 11; c <= 23; c++) {
          excelRow.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F5F5' } };
          excelRow.getCell(c).font = { color: { argb: 'FFAAAAAA' } };
        }
      } else {
        excelRow.getCell(25).font = { color: { argb: 'FF27AE60' }, size: 10 };
      }

      setWarningCell(excelRow.getCell(26), row.clock_diff_status);
      setWarningCell(excelRow.getCell(27), row.lunch_diff_status);
    }

    ws.views = [{ state: 'frozen', ySplit: 1 }];
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
    tcw_lunch_in: string;
    tcw_lunch_out: string;
    tcw_lunch_minutes: number;
    tcw_lunch_warning: string;
    activity_employee: string;
    activity_total_hours: string;
    activity_clock_in: string;
    in_diff: string;
    in_diff_mins: number | null;
    activity_clock_out: string;
    out_diff: string;
    out_diff_mins: number | null;
    activity_status: string;
    activity_lunch_in: string;
    lunch_in_diff: string;
    lunch_in_diff_mins: number | null;
    activity_lunch_out: string;
    lunch_out_diff: string;
    lunch_out_diff_mins: number | null;
    activity_lunch_minutes: number;
    activity_lunch_warning: string;
    match_source: string;
    match_result: string;
    has_tcw_missing_clock_out: boolean;
    has_activity_clock_out_warning: boolean;
    has_no_match: boolean;
    clock_diff_status: 'OK' | 'REVIEW_REQUIRED' | 'NO_DATA';
    lunch_diff_status: 'OK' | 'REVIEW_REQUIRED' | 'NO_DATA';
  }[]> {
    const extractTimeParts = (
      value: string | null | undefined,
    ): { hh: string; mm: string; ss: string } | null => {
      if (!value) return null;

      const raw = String(value).trim();
      if (!raw || raw === '—') return null;

      const match = raw.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
      if (!match) return null;

      return {
        hh: match[1].padStart(2, '0'),
        mm: match[2],
        ss: (match[3] ?? '00').padStart(2, '0'),
      };
    };

    const formatHHMM = (value: string | null | undefined): string => {
      const parts = extractTimeParts(value);
      if (!parts) return '—';
      return `${parts.hh}:${parts.mm}`;
    };

    const formatHHMMSS = (value: string | null | undefined): string => {
      const parts = extractTimeParts(value);
      if (!parts) return '—';
      return `${parts.hh}:${parts.mm}:${parts.ss}`;
    };

    const toMinutes = (value: string | null | undefined): number | null => {
      const parts = extractTimeParts(value);
      if (!parts) return null;
      return this.timeToMinutes(`${parts.hh}:${parts.mm}:${parts.ss}`);
    };

    const diffLabel = (minsDiff: number): string => {
      const abs = Math.abs(minsDiff);
      const sign = minsDiff >= 0 ? '+' : '-';
      const h = Math.floor(abs / 60);
      const m = abs % 60;
      return h > 0 ? `${sign}${h}h ${m}m` : `${sign}${m}m`;
    };

    const formatHoursTrimmed = (value: number | null | undefined): string => {
      return parseFloat(Number(value ?? 0).toFixed(2)).toString();
    };

    const formatHoursFixed = (value: number | null | undefined): string => {
      return Number(value ?? 0).toFixed(2);
    };

    const hoursToMinutes = (value: number | null | undefined): number => {
      return Math.max(0, Math.round(Number(value ?? 0) * 60));
    };

    const sourceLabel = (source: string | null | undefined): string => {
      const raw = String(source ?? '').trim().toLowerCase();
      if (raw === 'vout') return 'Activity VOUT';
      if (raw === 'one') return 'Activity ONE';
      return 'Activity';
    };

    const buildDiff = (
      tcwMinutes: number | null,
      activityMinutes: number | null,
    ): { mins: number | null; label: string } => {
      if (tcwMinutes === null || activityMinutes === null) {
        return { mins: null, label: '—' };
      }

      const mins = activityMinutes - tcwMinutes;
      return {
        mins,
        label: Math.abs(mins) > 3 ? `⚠️ ${diffLabel(mins)}` : `✅ ${diffLabel(mins)}`,
      };
    };

    let fixedPayroll: any[] = [];
    let variablePayroll: any[] = [];

    const [fixedResult, variableResult] = await Promise.allSettled([
      this.getPayrollData('fixed' as WorkSchedule, start_date, end_date),
      this.getPayrollData('variable' as WorkSchedule, start_date, end_date),
    ]);

    if (fixedResult.status === 'fulfilled') {
      fixedPayroll = Array.isArray(fixedResult.value) ? fixedResult.value : [];
    } else {
      console.error('⚠️ getClockComparisonData fixed payroll failed:', fixedResult.reason?.message ?? fixedResult.reason);
    }

    if (variableResult.status === 'fulfilled') {
      variablePayroll = Array.isArray(variableResult.value) ? variableResult.value : [];
    } else {
      console.error('⚠️ getClockComparisonData variable payroll failed:', variableResult.reason?.message ?? variableResult.reason);
    }

    if (
      fixedResult.status === 'rejected' &&
      variableResult.status === 'rejected'
    ) {
      throw new InternalServerErrorException(
        'Failed to build clock comparison data',
      );
    }

    const payrollEmployees = [...fixedPayroll, ...variablePayroll];
    const rows: Array<{
      date: string;
      tcw_employee: string;
      tcw_clock_in: string;
      tcw_clock_out: string;
      tcw_clock_out_status: string;
      tcw_hours: string;
      tcw_lunch_in: string;
      tcw_lunch_out: string;
      tcw_lunch_minutes: number;
      tcw_lunch_warning: string;
      activity_employee: string;
      activity_total_hours: string;
      activity_clock_in: string;
      in_diff: string;
      in_diff_mins: number | null;
      activity_clock_out: string;
      out_diff: string;
      out_diff_mins: number | null;
      activity_status: string;
      activity_lunch_in: string;
      lunch_in_diff: string;
      lunch_in_diff_mins: number | null;
      activity_lunch_out: string;
      lunch_out_diff: string;
      lunch_out_diff_mins: number | null;
      activity_lunch_minutes: number;
      activity_lunch_warning: string;
      match_source: string;
      match_result: string;
      has_tcw_missing_clock_out: boolean;
      has_activity_clock_out_warning: boolean;
      has_no_match: boolean;
      clock_diff_status: 'OK' | 'REVIEW_REQUIRED' | 'NO_DATA';
      lunch_diff_status: 'OK' | 'REVIEW_REQUIRED' | 'NO_DATA';
    }> = [];

    const seen = new Set<string>();

    for (const emp of payrollEmployees) {
      const employeeNumber = String(emp?.employee_number ?? '');
      const scheduleDetails = Array.isArray(emp?.schedule_details)
        ? emp.schedule_details
        : [];

      for (const day of scheduleDetails) {
        const date = String(day?.date ?? '');
        const tcw = day?.time_clock_wizard ?? null;
        const activity = day?.activity_report ?? null;

        // Esta vista se basa en días con TCW, igual que la comparación original.
        if (!tcw || !date) continue;

        const uniqueKey = `${employeeNumber}__${date}`;
        if (seen.has(uniqueKey)) continue;
        seen.add(uniqueKey);

        const tcwEmployee = String(
          tcw?.employee_name ??
          `${emp?.last_name ?? ''} ${emp?.name ?? ''}`.trim() ??
          '—',
        );

        const tcwClockIn = tcw?.shift_start ? formatHHMM(tcw.shift_start) : '—';
        const tcwClockOut = tcw?.shift_end ? formatHHMM(tcw.shift_end) : '—';
        const tcwMissingClockOut = Boolean(
          tcw?.missing_clock_out || !tcw?.shift_end,
        );

        const tcwHours = formatHoursTrimmed(Number(tcw?.worked_hours ?? 0));

        const tcwLunchIn = tcw?.lunch_start ? formatHHMM(tcw.lunch_start) : 'No lunch';
        const tcwLunchOut = tcw?.lunch_end ? formatHHMM(tcw.lunch_end) : 'No lunch';
        const tcwLunchMinutes = tcw?.lunch_start && tcw?.lunch_end
          ? hoursToMinutes(tcw?.lunch_total_hours)
          : 0;

        let tcwLunchWarning = '— Not registered';
        if (tcw?.lunch_start && tcw?.lunch_end) {
          tcwLunchWarning =
            tcwLunchMinutes > 60 ? '⚠️ Lunch exceeded 60 min' : '✅ OK';
        }

        const hasActivity = Boolean(activity);
        const matchSource = hasActivity ? sourceLabel(activity?.source) : '—';

        const activityEmployee = hasActivity
          ? String(activity?.employee_name ?? '—')
          : '—';

        const activityClockIn = hasActivity && activity?.shift_start
          ? formatHHMMSS(activity.shift_start)
          : '—';

        const activityClockOut = hasActivity && activity?.shift_end
          ? formatHHMMSS(activity.shift_end)
          : '—';

        const activityHours = hasActivity
          ? formatHoursFixed(Number(activity?.worked_hours ?? 0))
          : '—';

        const activityLunchIn = hasActivity
          ? activity?.lunch_start
            ? formatHHMMSS(activity.lunch_start)
            : 'No lunch'
          : '—';

        const activityLunchOut = hasActivity
          ? activity?.lunch_end
            ? formatHHMMSS(activity.lunch_end)
            : 'No lunch'
          : '—';

        const activityLunchMinutes =
          hasActivity && activity?.lunch_start && activity?.lunch_end
            ? hoursToMinutes(activity?.lunch_total_hours)
            : 0;

        let activityLunchWarning = '—';
        if (hasActivity) {
          if (!activity?.lunch_start || !activity?.lunch_end || activityLunchMinutes === 0) {
            activityLunchWarning = '— Not registered';
          } else if (activityLunchMinutes > 60) {
            activityLunchWarning = '⚠️ Lunch exceeded 60 min';
          } else {
            activityLunchWarning = '✅ OK';
          }
        }

        const inDiff = buildDiff(
          toMinutes(tcw?.shift_start),
          toMinutes(activity?.shift_start),
        );

        const outDiff = buildDiff(
          toMinutes(tcw?.shift_end),
          toMinutes(activity?.shift_end),
        );

        const tcwHasLunch =
          toMinutes(tcw?.lunch_start) !== null && toMinutes(tcw?.lunch_end) !== null;

        const activityHasLunch =
          toMinutes(activity?.lunch_start) !== null &&
          toMinutes(activity?.lunch_end) !== null;

        let lunchInDiffMins: number | null = null;
        let lunchInDiffStr = '—';
        let lunchOutDiffMins: number | null = null;
        let lunchOutDiffStr = '—';
        let lunchDiffStatus: 'OK' | 'REVIEW_REQUIRED' | 'NO_DATA' = 'NO_DATA';

        if (!hasActivity) {
          lunchDiffStatus = 'NO_DATA';
        } else if (!tcwHasLunch && !activityHasLunch) {
          lunchDiffStatus = 'NO_DATA';
        } else if (tcwHasLunch && !activityHasLunch) {
          lunchInDiffStr = '⚠️ Missing in Activity';
          lunchOutDiffStr = '⚠️ Missing in Activity';
          lunchDiffStatus = 'REVIEW_REQUIRED';
        } else if (!tcwHasLunch && activityHasLunch) {
          lunchInDiffStr = '⚠️ Missing in TCW';
          lunchOutDiffStr = '⚠️ Missing in TCW';
          lunchDiffStatus = 'REVIEW_REQUIRED';
        } else {
          lunchInDiffMins =
            toMinutes(activity?.lunch_start)! - toMinutes(tcw?.lunch_start)!;
          lunchOutDiffMins =
            toMinutes(activity?.lunch_end)! - toMinutes(tcw?.lunch_end)!;

          lunchInDiffStr =
            Math.abs(lunchInDiffMins) > 3
              ? `⚠️ ${diffLabel(lunchInDiffMins)}`
              : `✅ ${diffLabel(lunchInDiffMins)}`;

          lunchOutDiffStr =
            Math.abs(lunchOutDiffMins) > 3
              ? `⚠️ ${diffLabel(lunchOutDiffMins)}`
              : `✅ ${diffLabel(lunchOutDiffMins)}`;

          if (Math.abs(lunchInDiffMins) > 3 || Math.abs(lunchOutDiffMins) > 3) {
            lunchDiffStatus = 'REVIEW_REQUIRED';
          } else {
            lunchDiffStatus = 'OK';
          }
        }

        let activityStatus = '—';
        if (hasActivity) {
          if (activity?.shift_end) {
            activityStatus = '✅ Clock Out registered';
          } else if (activity?.shift_start) {
            activityStatus = `🟠 NO CLOCK OUT — Last interaction found in ${matchSource}. Please verify the missing Clock Out in ${matchSource}.`;
          } else {
            activityStatus = `🟠 NO CLOCK OUT — No activity records found in ${matchSource}. Please verify in ${matchSource}.`;
          }
        }

        const tcwClockOutStatus = tcwMissingClockOut
          ? '🟠 Missing Clock Out in TCW — Please verify and correct the missing Clock Out entry.'
          : '✅ OK';

        const hasInWarning = inDiff.mins !== null && Math.abs(inDiff.mins) > 3;
        const hasOutWarning = outDiff.mins !== null && Math.abs(outDiff.mins) > 3;
        const hasAnyClockData = inDiff.mins !== null || outDiff.mins !== null;

        const clockDiffStatus: 'OK' | 'REVIEW_REQUIRED' | 'NO_DATA' =
          !hasAnyClockData
            ? 'NO_DATA'
            : hasInWarning || hasOutWarning
              ? 'REVIEW_REQUIRED'
              : 'OK';

        rows.push({
          date,
          tcw_employee: tcwEmployee,
          tcw_clock_in: tcwClockIn,
          tcw_clock_out: tcwClockOut,
          tcw_clock_out_status: tcwClockOutStatus,
          tcw_hours: tcwHours,
          tcw_lunch_in: tcwLunchIn,
          tcw_lunch_out: tcwLunchOut,
          tcw_lunch_minutes: tcwLunchMinutes,
          tcw_lunch_warning: tcwLunchWarning,
          activity_employee: activityEmployee,
          activity_total_hours: activityHours,
          activity_clock_in: activityClockIn,
          in_diff: inDiff.label,
          in_diff_mins: inDiff.mins,
          activity_clock_out: activityClockOut,
          out_diff: outDiff.label,
          out_diff_mins: outDiff.mins,
          activity_status: activityStatus,
          activity_lunch_in: activityLunchIn,
          lunch_in_diff: lunchInDiffStr,
          lunch_in_diff_mins: lunchInDiffMins,
          activity_lunch_out: activityLunchOut,
          lunch_out_diff: lunchOutDiffStr,
          lunch_out_diff_mins: lunchOutDiffMins,
          activity_lunch_minutes: activityLunchMinutes,
          activity_lunch_warning: activityLunchWarning,
          match_source: matchSource,
          match_result: hasActivity ? '✅ Match found' : '⚠️ No match found',
          has_tcw_missing_clock_out: tcwMissingClockOut,
          has_activity_clock_out_warning: Boolean(hasActivity && !activity?.shift_end),
          has_no_match: !hasActivity,
          clock_diff_status: clockDiffStatus,
          lunch_diff_status: lunchDiffStatus,
        });
      }
    }

    rows.sort((a, b) => {
      if (a.date === b.date) {
        return a.tcw_employee.localeCompare(b.tcw_employee);
      }
      return a.date.localeCompare(b.date);
    });

    return rows;
  }

  async generatePayrollZip(
    work_schedule: WorkSchedule,
    start_date: string,
    end_date: string,
  ): Promise<Buffer> {
    const data = await this.getPayrollData(work_schedule, start_date, end_date);

    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    try {
      const page = await browser.newPage();
      page.setDefaultNavigationTimeout(0);
      page.setDefaultTimeout(0);

      const zip = new JSZip();

      for (const emp of data) {
        const pdfBuffer = await this.renderEmployeePdfBuffer(
          page,
          emp,
          work_schedule,
          start_date,
          end_date,
        );

        if (!pdfBuffer || !pdfBuffer.length) {
          continue;
        }

        const empNum = this.safeFileName(emp.employee_number);
        const fullName = this.safeFileName(`${emp.last_name}_${emp.name}`);
        const fileName = `${empNum}_${fullName}_${start_date}_${end_date}.pdf`;

        zip.file(fileName, pdfBuffer);
      }

      const filesCount = Object.keys(zip.files).length;

      if (!filesCount) {
        throw new BadRequestException('No se pudieron generar PDFs individuales para el ZIP');
      }

      const zipUint8 = await zip.generateAsync({
        type: 'uint8array',
        compression: 'DEFLATE',
        compressionOptions: { level: 9 },
      });

      return Buffer.from(zipUint8);
    } finally {
      await browser.close();
    }
  }

  async generatePayrollPdf(
    work_schedule: WorkSchedule,
    start_date: string,
    end_date: string,
  ): Promise<Buffer> {
    const data = await this.getPayrollData(work_schedule, start_date, end_date);

    if (!Array.isArray(data) || !data.length) {
      throw new BadRequestException('No payroll data found for the selected period');
    }

    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    try {
      const page = await browser.newPage();
      page.setDefaultNavigationTimeout(0);
      page.setDefaultTimeout(0);

      const zip = new JSZip();

      for (const emp of data) {
        const pdfBuffer = await this.renderEmployeePdf(
          page,
          emp,
          work_schedule,
          start_date,
          end_date,
        );

        if (!pdfBuffer?.length) {
          continue;
        }

        const empNum = this.safeFileName(emp?.employee_number || 'employee');
        const fullName = this.safeFileName(
          `${emp?.last_name || ''}_${emp?.name || ''}` || 'employee',
        );

        const fileName = `${empNum}_${fullName}_${start_date}_${end_date}.pdf`;

        zip.file(fileName, pdfBuffer);
      }

      const filesCount = Object.keys(zip.files).length;

      if (!filesCount) {
        throw new InternalServerErrorException(
          'No se pudo generar ningún PDF individual para el ZIP',
        );
      }

      const zipBytes = await zip.generateAsync({
        type: 'uint8array',
        compression: 'DEFLATE',
        compressionOptions: { level: 9 },
      });

      return Buffer.from(zipBytes);
    } finally {
      await browser.close();
    }
  }
}
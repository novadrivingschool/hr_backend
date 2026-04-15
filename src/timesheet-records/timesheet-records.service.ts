import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as ExcelJS from 'exceljs';
import { SelectQueryBuilder, Repository } from 'typeorm';
import { CreateTimesheetRecordDto } from './dto/create-timesheet-record.dto';
import { QueryTimesheetRecordDto } from './dto/query-timesheet-record.dto';
import { UpdateTimesheetRecordDto } from './dto/update-timesheet-record.dto';
import { TimesheetRecord } from './entities/timesheet-record.entity';

type ParsedCsvRecord = {
  employee: string;
  hour_type: string;
  day_date: string;
  day_date_raw: string | null;
  time_in: string | null;
  time_out: string | null;
  hours: number;
  paid_break: number;
  unpaid_break: number;
  day_wise_total_hours: number;
  total_hours: number;
  total_paid_break: number;
  total_unpaid_break: number;
  total_day_wise_total_hours: number;
};

@Injectable()
export class TimesheetRecordsService {
  constructor(
    @InjectRepository(TimesheetRecord)
    private readonly timesheetRecordRepository: Repository<TimesheetRecord>,
  ) {}

  async create(createDto: CreateTimesheetRecordDto) {
    const entity = this.timesheetRecordRepository.create({
      employee: this.requiredTrimmed(createDto.employee, 'employee'),
      hour_type: this.safeTrim(createDto.hour_type) || 'Regular',
      day_date: createDto.day_date,
      day_date_raw: createDto.day_date_raw ?? createDto.day_date,
      time_in: this.normalizeClockValue(createDto.time_in),
      time_out: this.normalizeClockValue(createDto.time_out),
      hours: this.round2(createDto.hours),
      paid_break: this.round2(createDto.paid_break),
      unpaid_break: this.round2(createDto.unpaid_break),
      day_wise_total_hours: this.round2(createDto.day_wise_total_hours),
      total_hours: this.round2(createDto.total_hours),
      total_paid_break: this.round2(createDto.total_paid_break),
      total_unpaid_break: this.round2(createDto.total_unpaid_break),
      total_day_wise_total_hours: this.round2(createDto.total_day_wise_total_hours),
    });

    return this.timesheetRecordRepository.save(entity);
  }

  async findAll(query: QueryTimesheetRecordDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;

    const qb = this.buildFilteredQuery(query)
      .skip((page - 1) * limit)
      .take(limit);

    const [data, total] = await qb.getManyAndCount();

    return {
      ok: true,
      page,
      limit,
      total,
      pageCount: total > 0 ? Math.ceil(total / limit) : 1,
      data,
    };
  }

  async exportExcel(query: QueryTimesheetRecordDto): Promise<Buffer> {
    const rows = await this.buildFilteredQuery(query).getMany();

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'OpenAI';
    workbook.created = new Date();

    const worksheet = workbook.addWorksheet('Timesheet Records', {
      views: [{ state: 'frozen', ySplit: 1 }],
    });

    worksheet.columns = [
      { header: 'Day Date', key: 'day_date', width: 14 },
      { header: 'Staff', key: 'employee', width: 30 },
      { header: 'Hour Type', key: 'hour_type', width: 16 },
      { header: 'Time In', key: 'time_in', width: 12 },
      { header: 'Time Out', key: 'time_out', width: 12 },
      { header: 'Hours', key: 'hours', width: 12 },
      { header: 'Paid Break', key: 'paid_break', width: 14 },
      { header: 'Unpaid Break', key: 'unpaid_break', width: 14 },
      { header: 'Day Wise Total Hours', key: 'day_wise_total_hours', width: 20 },
      { header: 'Total Hours', key: 'total_hours', width: 14 },
      { header: 'Total Paid Break', key: 'total_paid_break', width: 18 },
      { header: 'Total Unpaid Break', key: 'total_unpaid_break', width: 20 },
      { header: 'Total Day Wise Total Hours', key: 'total_day_wise_total_hours', width: 24 },
    ];

    worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1E4D8C' },
    };
    worksheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };
    worksheet.getRow(1).height = 22;
    worksheet.autoFilter = {
      from: 'A1',
      to: 'M1',
    };

    rows.forEach((row) => {
      worksheet.addRow({
        day_date: this.formatDisplayDate(row.day_date),
        employee: row.employee,
        hour_type: row.hour_type,
        time_in: this.formatTime24(row.time_in),
        time_out: this.formatTime24(row.time_out),
        hours: this.round2(row.hours),
        paid_break: this.round2(row.paid_break),
        unpaid_break: this.round2(row.unpaid_break),
        day_wise_total_hours: this.round2(row.day_wise_total_hours),
        total_hours: this.round2(row.total_hours),
        total_paid_break: this.round2(row.total_paid_break),
        total_unpaid_break: this.round2(row.total_unpaid_break),
        total_day_wise_total_hours: this.round2(row.total_day_wise_total_hours),
      });
    });

    worksheet.eachRow((row, rowNumber) => {
      row.alignment = { vertical: 'middle' };
      row.border = {
        bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
      };

      if (rowNumber > 1) {
        const fillArgb = rowNumber % 2 === 0 ? 'FFF1F5F9' : 'FFE2E8F0';
        row.eachCell((cell) => {
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: fillArgb },
          };
        });
      }
    });

    ['F', 'G', 'H', 'I', 'J', 'K', 'L', 'M'].forEach((columnKey) => {
      worksheet.getColumn(columnKey).numFmt = '0.00';
      worksheet.getColumn(columnKey).alignment = { horizontal: 'right', vertical: 'middle' };
    });

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer as ArrayBuffer);
  }

  buildExportFileSuffix(query: QueryTimesheetRecordDto): string {
    const parts: string[] = [];

    if (query.start_date) parts.push(query.start_date);
    if (query.end_date) parts.push(query.end_date);
    if (query.employee) {
      parts.push(this.safeFileName(query.employee));
    }

    return parts.length ? `_${parts.join('_')}` : '';
  }

  async findOne(id: string) {
    const record = await this.timesheetRecordRepository.findOne({ where: { id } });

    if (!record) {
      throw new NotFoundException(`Timesheet record with id ${id} not found`);
    }

    return record;
  }

  async update(id: string, updateDto: UpdateTimesheetRecordDto) {
    const record = await this.findOne(id);

    const merged = this.timesheetRecordRepository.merge(record, {
      employee:
        updateDto.employee !== undefined
          ? this.requiredTrimmed(updateDto.employee, 'employee')
          : record.employee,
      hour_type:
        updateDto.hour_type !== undefined
          ? this.safeTrim(updateDto.hour_type) || 'Regular'
          : record.hour_type,
      day_date: updateDto.day_date ?? record.day_date,
      day_date_raw:
        updateDto.day_date_raw !== undefined
          ? updateDto.day_date_raw
          : record.day_date_raw,
      time_in:
        updateDto.time_in !== undefined
          ? this.normalizeClockValue(updateDto.time_in)
          : record.time_in,
      time_out:
        updateDto.time_out !== undefined
          ? this.normalizeClockValue(updateDto.time_out)
          : record.time_out,
      hours:
        updateDto.hours !== undefined ? this.round2(updateDto.hours) : record.hours,
      paid_break:
        updateDto.paid_break !== undefined
          ? this.round2(updateDto.paid_break)
          : record.paid_break,
      unpaid_break:
        updateDto.unpaid_break !== undefined
          ? this.round2(updateDto.unpaid_break)
          : record.unpaid_break,
      day_wise_total_hours:
        updateDto.day_wise_total_hours !== undefined
          ? this.round2(updateDto.day_wise_total_hours)
          : record.day_wise_total_hours,
      total_hours:
        updateDto.total_hours !== undefined
          ? this.round2(updateDto.total_hours)
          : record.total_hours,
      total_paid_break:
        updateDto.total_paid_break !== undefined
          ? this.round2(updateDto.total_paid_break)
          : record.total_paid_break,
      total_unpaid_break:
        updateDto.total_unpaid_break !== undefined
          ? this.round2(updateDto.total_unpaid_break)
          : record.total_unpaid_break,
      total_day_wise_total_hours:
        updateDto.total_day_wise_total_hours !== undefined
          ? this.round2(updateDto.total_day_wise_total_hours)
          : record.total_day_wise_total_hours,
    });

    return this.timesheetRecordRepository.save(merged);
  }

  async remove(id: string) {
    const record = await this.findOne(id);
    await this.timesheetRecordRepository.remove(record);

    return {
      ok: true,
      deleted_id: id,
    };
  }

  async importCsv(buffer: Buffer) {
    const parsed = this.parseCsvBuffer(buffer);

    if (!parsed.rows.length) {
      throw new BadRequestException('The CSV does not contain valid rows to import');
    }

    const deletedExistingRows = await this.timesheetRecordRepository.manager.transaction(async (manager) => {
      const repository = manager.getRepository(TimesheetRecord);
      const deletedCount = await this.deleteByEmployeeDayPairs(repository, parsed.employeeDayPairs);

      const insertChunks = this.chunkArray(parsed.rows, 500);
      for (const chunk of insertChunks) {
        await repository.insert(chunk);
      }

      return deletedCount;
    });

    return {
      ok: true,
      imported_rows: parsed.rows.length,
      deleted_existing_rows: deletedExistingRows,
      skipped_rows: parsed.skippedRows,
      employees_count: parsed.employees.length,
      start_date: parsed.minDate,
      end_date: parsed.maxDate,
      employees: parsed.employees,
    };
  }

  private buildFilteredQuery(query: QueryTimesheetRecordDto): SelectQueryBuilder<TimesheetRecord> {
    const sortOrder = String(query.sort_order ?? 'ASC').toUpperCase() as 'ASC' | 'DESC';
    const qb = this.timesheetRecordRepository.createQueryBuilder('t');

    if (query.employee) {
      qb.andWhere('LOWER(t.employee) LIKE :employee', {
        employee: `%${query.employee.toLowerCase()}%`,
      });
    }

    if (query.hour_type) {
      qb.andWhere('LOWER(t.hour_type) LIKE :hourType', {
        hourType: `%${query.hour_type.toLowerCase()}%`,
      });
    }

    if (query.start_date) {
      qb.andWhere('t.day_date >= :startDate', { startDate: query.start_date });
    }

    if (query.end_date) {
      qb.andWhere('t.day_date <= :endDate', { endDate: query.end_date });
    }

    qb.orderBy('t.day_date', sortOrder)
      .addOrderBy('t.employee', 'ASC')
      .addOrderBy('t.time_in', 'ASC')
      .addOrderBy('t.id', 'ASC');

    return qb;
  }

  private parseCsvBuffer(buffer: Buffer) {
    const content = buffer.toString('utf-8').replace(/^\uFEFF/, '');
    const rawLines = content.split(/\r?\n/).filter((line) => line.trim().length > 0);

    if (!rawLines.length) {
      throw new BadRequestException('The CSV file is empty');
    }

    const headers = this.splitCsvLine(rawLines[0]).map((header) => header.trim());
    const requiredHeaders = [
      'Employee',
      'Hour Type',
      'DayDate',
      'In',
      'Out',
      'Hours',
      'Paid Break',
      'Unpaid Break',
      'DayWiseTotalHours',
      'Total Hours',
      'TotalPaidBreak',
      'TotalUnpaidBreak',
      'TotalDaywiseTotalhours',
    ];

    const missingHeaders = requiredHeaders.filter((header) => !headers.includes(header));
    if (missingHeaders.length) {
      throw new BadRequestException(
        `Missing required CSV columns: ${missingHeaders.join(', ')}`,
      );
    }

    const rows: ParsedCsvRecord[] = [];
    const employeeDayPairs = new Map<string, { employee: string; day_date: string }>();
    const employeesSet = new Set<string>();
    let minDate: string | null = null;
    let maxDate: string | null = null;
    let skippedRows = 0;

    for (let index = 1; index < rawLines.length; index += 1) {
      const rawLine = rawLines[index];
      const cols = this.splitCsvLine(rawLine);
      const payload: Record<string, string> = {};

      headers.forEach((header, headerPosition) => {
        payload[header] = (cols[headerPosition] ?? '').trim();
      });

      const employee = this.safeTrim(payload['Employee']);
      const dayDateRaw = this.safeTrim(payload['DayDate']);
      const dayDate = this.parseCsvDate(dayDateRaw);

      if (!employee || !dayDate) {
        skippedRows += 1;
        continue;
      }

      rows.push({
        employee,
        hour_type: this.safeTrim(payload['Hour Type']) || 'Regular',
        day_date: dayDate,
        day_date_raw: dayDateRaw || null,
        time_in: this.normalizeClockValue(payload['In']),
        time_out: this.normalizeClockValue(payload['Out']),
        hours: this.parseDecimal(payload['Hours']),
        paid_break: this.parseDecimal(payload['Paid Break']),
        unpaid_break: this.parseDecimal(payload['Unpaid Break']),
        day_wise_total_hours: this.parseDecimal(payload['DayWiseTotalHours']),
        total_hours: this.parseDecimal(payload['Total Hours']),
        total_paid_break: this.parseDecimal(payload['TotalPaidBreak']),
        total_unpaid_break: this.parseDecimal(payload['TotalUnpaidBreak']),
        total_day_wise_total_hours: this.parseDecimal(payload['TotalDaywiseTotalhours']),
      });

      employeeDayPairs.set(`${employee}__${dayDate}`, { employee, day_date: dayDate });
      employeesSet.add(employee);

      if (!minDate || dayDate < minDate) minDate = dayDate;
      if (!maxDate || dayDate > maxDate) maxDate = dayDate;
    }

    return {
      rows,
      employeeDayPairs: Array.from(employeeDayPairs.values()),
      employees: Array.from(employeesSet).sort((a, b) => a.localeCompare(b)),
      minDate,
      maxDate,
      skippedRows,
    };
  }

  private async deleteByEmployeeDayPairs(
    repository: Repository<TimesheetRecord>,
    pairs: Array<{ employee: string; day_date: string }>,
  ) {
    if (!pairs.length) return 0;

    let deleted = 0;
    const chunks = this.chunkArray(pairs, 300);

    for (const chunk of chunks) {
      const conditions: string[] = [];
      const params: Record<string, string> = {};

      chunk.forEach((pair, index) => {
        conditions.push(`(employee = :employee${index} AND day_date = :dayDate${index})`);
        params[`employee${index}`] = pair.employee;
        params[`dayDate${index}`] = pair.day_date;
      });

      const result = await repository
        .createQueryBuilder()
        .delete()
        .from(TimesheetRecord)
        .where(conditions.join(' OR '), params)
        .execute();

      deleted += result.affected ?? 0;
    }

    return deleted;
  }

  private splitCsvLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let insideQuotes = false;

    for (let index = 0; index < line.length; index += 1) {
      const char = line[index];
      const nextChar = line[index + 1];

      if (char === '"') {
        if (insideQuotes && nextChar === '"') {
          current += '"';
          index += 1;
        } else {
          insideQuotes = !insideQuotes;
        }
        continue;
      }

      if (char === ',' && !insideQuotes) {
        result.push(current);
        current = '';
        continue;
      }

      current += char;
    }

    result.push(current);
    return result;
  }

  private parseCsvDate(rawValue: string | null | undefined): string | null {
    const value = this.safeTrim(rawValue);
    if (!value) return null;

    const text = value.replace(/^[A-Za-z]{3}\s+/, '');
    const directMatch = text.match(/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2})\s+(\d{4})$/i);

    if (directMatch) {
      const monthMap: Record<string, string> = {
        jan: '01',
        feb: '02',
        mar: '03',
        apr: '04',
        may: '05',
        jun: '06',
        jul: '07',
        aug: '08',
        sep: '09',
        oct: '10',
        nov: '11',
        dec: '12',
      };

      const month = monthMap[directMatch[1].toLowerCase()];
      const day = String(Number(directMatch[2])).padStart(2, '0');
      const year = directMatch[3];

      return `${year}-${month}-${day}`;
    }

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return null;
    }

    const year = parsed.getFullYear();
    const month = String(parsed.getMonth() + 1).padStart(2, '0');
    const day = String(parsed.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
  }

  private normalizeClockValue(value: unknown): string | null {
    const normalized = this.safeTrim(value);
    if (!normalized || normalized === '0') return null;
    return normalized;
  }

  private parseDecimal(value: unknown): number {
    const normalized = this.safeTrim(value);
    if (!normalized) return 0;
    const parsed = Number(String(normalized).replace(/,/g, ''));
    if (!Number.isFinite(parsed)) return 0;
    return this.round2(parsed);
  }

  private round2(value: unknown): number {
    const numeric = Number(value ?? 0);
    if (!Number.isFinite(numeric)) return 0;
    return Number(numeric.toFixed(2));
  }

  private safeTrim(value: unknown): string {
    if (value === undefined || value === null) return '';
    return String(value).trim();
  }

  private requiredTrimmed(value: unknown, field: string): string {
    const normalized = this.safeTrim(value);
    if (!normalized) {
      throw new BadRequestException(`${field} is required`);
    }
    return normalized;
  }

  private safeFileName(value: string): string {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9-_]+/g, '_')
      .replace(/^_+|_+$/g, '');
  }

  private formatDisplayDate(value: string | null | undefined): string {
    const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return value || '—';
    return `${match[3]}-${match[2]}-${match[1]}`;
  }

  private formatTime24(value: string | null | undefined): string {
    const raw = this.safeTrim(value).toUpperCase();
    if (!raw) return '—';

    const meridiemMatch = raw.match(/^(\d{1,2}):(\d{2})(AM|PM)$/);
    if (meridiemMatch) {
      let hours = Number(meridiemMatch[1]);
      const minutes = meridiemMatch[2];
      const meridiem = meridiemMatch[3];

      if (meridiem === 'AM' && hours === 12) hours = 0;
      if (meridiem === 'PM' && hours !== 12) hours += 12;

      return `${String(hours).padStart(2, '0')}:${minutes}`;
    }

    const h24Match = raw.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
    if (h24Match) {
      return `${String(Number(h24Match[1])).padStart(2, '0')}:${h24Match[2]}`;
    }

    return raw;
  }

  private chunkArray<T>(items: T[], chunkSize: number): T[][] {
    const result: T[][] = [];
    for (let index = 0; index < items.length; index += chunkSize) {
      result.push(items.slice(index, index + chunkSize));
    }
    return result;
  }
}

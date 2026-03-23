import {
  Controller, Query, BadRequestException,
  Post, UseInterceptors, UploadedFile, Res,
  Body,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { PayrollService } from './payroll.service';
import { WorkSchedule } from 'src/employees/entities/work-schedule.enum';
import { Response } from 'express';

@Controller('payroll')
export class PayrollController {
  constructor(private readonly payrollService: PayrollService) { }

  @Post('records/pdf')
  async getPayrollPdf(
    @Query('work_schedule') work_schedule: string,
    @Query('start_date') start_date: string,
    @Query('end_date') end_date: string,
    @Res() res: Response,
  ) {
    if (!work_schedule || !start_date || !end_date) {
      throw new BadRequestException('work_schedule, start_date y end_date son requeridos');
    }

    if (!Object.values(WorkSchedule).includes(work_schedule.toLowerCase() as WorkSchedule)) {
      throw new BadRequestException('work_schedule debe ser "fixed" o "variable"');
    }

    const hasData = await this.payrollService.hasTimesheetDataForRange(start_date, end_date);
    if (!hasData) {
      throw new BadRequestException(
        `No hay datos de timesheet registrados para el rango ${start_date} — ${end_date}. ` +
        `Por favor, sube primero el archivo CSV mediante el endpoint correspondiente.`,
      );
    }

    const buffer = await this.payrollService.generatePayrollPdf(
      work_schedule.toLowerCase() as WorkSchedule,
      start_date,
      end_date,
    );

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="payroll_${work_schedule}_${start_date}_${end_date}.pdf"`,
    );
    res.send(buffer);
  }

  @Post('records/data')
  async getPayrollData(
    @Query('work_schedule') work_schedule: string,
    @Query('start_date') start_date: string,
    @Query('end_date') end_date: string,
  ) {
    if (!work_schedule || !start_date || !end_date) {
      throw new BadRequestException('work_schedule, start_date y end_date son requeridos');
    }

    if (!Object.values(WorkSchedule).includes(work_schedule.toLowerCase() as WorkSchedule)) {
      throw new BadRequestException('work_schedule debe ser "fixed" o "variable"');
    }

    const hasData = await this.payrollService.hasTimesheetDataForRange(start_date, end_date);
    if (!hasData) {
      throw new BadRequestException(
        `No hay datos de timesheet registrados para el rango ${start_date} — ${end_date}. ` +
        `Por favor, sube primero el archivo CSV mediante el endpoint correspondiente.`,
      );
    }

    const data = await this.payrollService.getPayrollData(
      work_schedule.toLowerCase() as WorkSchedule,
      start_date,
      end_date,
    );

    return {
      ok: true,
      total: data.length,
      data,
    };
  }

  @Post('timesheets/parse')
  @UseInterceptors(FileInterceptor('file'))
  async parseTimesheet(
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    if (!file.originalname.endsWith('.csv')) {
      throw new BadRequestException('File must be a CSV');
    }

    const data = await this.payrollService.parseTimesheetCsv(file.buffer);

    return { ok: true, total_employees: data.length, data };
  }

  @Post('timesheets/clock-comparison')
  async exportClockComparison(
    @Body() body: { start_date: string; end_date: string },
    @Res() res: Response,
  ) {
    const { start_date, end_date } = body;

    if (!start_date || !end_date) {
      throw new BadRequestException('start_date and end_date are required');
    }

    const buf = await this.payrollService.exportClockComparisonExcel(
      start_date,
      end_date,
    );

    const pad = (n: number) => String(n).padStart(2, '0');
    const now = new Date();
    const ymd = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    const fname = `ClockComparison_${start_date}_${end_date}_${ymd}.xlsx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${fname}"`);
    res.send(buf);
  }

  @Post('timesheets/clock-comparison/data')
  async getClockComparisonData(
    @Body() body: { start_date: string; end_date: string },
  ) {
    const { start_date, end_date } = body;

    if (!start_date || !end_date) {
      throw new BadRequestException('start_date and end_date are required');
    }

    const data = await this.payrollService.getClockComparisonData(start_date, end_date);

    return {
      ok: true,
      total: data.length,
      data,
    };
  }
}
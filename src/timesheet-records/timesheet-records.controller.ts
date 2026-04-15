import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { CreateTimesheetRecordDto } from './dto/create-timesheet-record.dto';
import { QueryTimesheetRecordDto } from './dto/query-timesheet-record.dto';
import { UpdateTimesheetRecordDto } from './dto/update-timesheet-record.dto';
import { TimesheetRecordsService } from './timesheet-records.service';

@Controller('timesheet-records')
export class TimesheetRecordsController {
  constructor(private readonly timesheetRecordsService: TimesheetRecordsService) {}

  @Post()
  create(@Body() createTimesheetRecordDto: CreateTimesheetRecordDto) {
    return this.timesheetRecordsService.create(createTimesheetRecordDto);
  }

  @Get()
  findAll(@Query() query: QueryTimesheetRecordDto) {
    return this.timesheetRecordsService.findAll(query);
  }

  @Get('export/excel')
  async exportExcel(@Query() query: QueryTimesheetRecordDto, @Res() res: Response) {
    const buffer = await this.timesheetRecordsService.exportExcel(query);

    const suffix = this.timesheetRecordsService.buildExportFileSuffix(query);
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="timesheet_records${suffix}.xlsx"`,
    );

    return res.send(buffer);
  }

  @Get(':id')
  findOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.timesheetRecordsService.findOne(id);
  }

  @Post('import-csv')
  @UseInterceptors(FileInterceptor('file'))
  importCsv(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    if (!file.originalname.toLowerCase().endsWith('.csv')) {
      throw new BadRequestException('File must be a CSV');
    }

    return this.timesheetRecordsService.importCsv(file.buffer);
  }

  @Patch(':id')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() updateTimesheetRecordDto: UpdateTimesheetRecordDto,
  ) {
    return this.timesheetRecordsService.update(id, updateTimesheetRecordDto);
  }

  @Delete(':id')
  remove(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.timesheetRecordsService.remove(id);
  }
}

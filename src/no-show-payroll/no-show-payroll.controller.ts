import {
  Controller,
  Body,
  Param,
  Post,
  Get,
  Patch,
  Delete,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common'
import { makeProgressReporter, getUploadProgress } from '../common/upload-progress.util'
import { parseCorrections, parseOnlyRows } from '../common/upload-validation.util'
import { Response } from 'express'
import { FileInterceptor } from '@nestjs/platform-express'
import { NoShowPayrollService } from './no-show-payroll.service'
import { buildRecordsExcel } from '../common/excel-export.util'

@Controller('no-show-payroll')
export class NoShowPayrollController {
  constructor(private readonly service: NoShowPayrollService) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  async upload(@UploadedFile() file: Express.Multer.File, @Body('upload_id') uploadId?: string, @Body('corrections') corrections?: string, @Body('only_rows') onlyRows?: string) {
    if (!file) throw new BadRequestException('No se recibió ningún archivo')
    const report = makeProgressReporter(uploadId)
    try {
      const result = await this.service.uploadExcel(file.buffer, report, parseCorrections(corrections), parseOnlyRows(onlyRows))
      report({ phase: 'done' })
      return result
    } catch (e) {
      report({ phase: 'error' })
      throw e
    }
  }

  @Get('upload-progress/:id')
  uploadProgress(@Param('id') id: string) {
    return getUploadProgress(id) ?? { phase: 'unknown' }
  }

  @Get('excel')
  async exportExcel(
    @Query('start_date') start_date: string,
    @Query('end_date') end_date: string,
    @Res() res: Response,
  ) {
    const { data } = await this.service.findAll({ start_date, end_date, limit: 100000 })
    const buffer = await buildRecordsExcel(data, { sheetName: 'No Show', headerColor: 'FFE53935' })
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', `attachment; filename="no-show-payroll_${start_date}_${end_date}.xlsx"`)
    res.send(buffer)
  }

  @Get()
  async findAll(
    @Query('start_date') start_date?: string,
    @Query('end_date')   end_date?: string,
    @Query('instructor') instructor?: string,
    @Query('status')     status?: string,
    @Query('page')       page?: string,
    @Query('limit')      limit?: string,
  ) {
    return this.service.findAll({
      start_date,
      end_date,
      instructor,
      status,
      page:  page  ? parseInt(page)  : 1,
      limit: limit ? parseInt(limit) : 100,
    })
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: Record<string, any>) {
    return this.service.update(id, body)
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id)
  }
}

import {
  Controller,
  Post,
  Get,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common'
import { Response } from 'express'
import { FileInterceptor } from '@nestjs/platform-express'
import { TeacherPayrollService } from './teacher-payroll.service'
import { buildRecordsExcel } from '../common/excel-export.util'

@Controller('teacher-payroll')
export class TeacherPayrollController {
  constructor(private readonly service: TeacherPayrollService) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  async upload(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('No se recibió ningún archivo')
    const result = await this.service.uploadExcel(file.buffer)
    return result
  }

  @Get('excel')
  async exportExcel(
    @Query('start_date') start_date: string,
    @Query('end_date') end_date: string,
    @Res() res: Response,
  ) {
    const { data } = await this.service.findAll({ start_date, end_date, limit: 100000 })
    const buffer = await buildRecordsExcel(data, { sheetName: 'Teachers', headerColor: 'FF43A047' })
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', `attachment; filename="teacher-payroll_${start_date}_${end_date}.xlsx"`)
    res.send(buffer)
  }

  @Get()
  async findAll(
    @Query('start_date') start_date?: string,
    @Query('end_date')   end_date?: string,
    @Query('teacher')    teacher?: string,
    @Query('status')     status?: string,
    @Query('page')       page?: string,
    @Query('limit')      limit?: string,
  ) {
    return this.service.findAll({
      start_date,
      end_date,
      teacher,
      status,
      page:  page  ? parseInt(page)  : 1,
      limit: limit ? parseInt(limit) : 100,
    })
  }
}

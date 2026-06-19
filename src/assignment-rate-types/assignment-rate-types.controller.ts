import {
  Controller, Post, Get, Res, UploadedFile,
  UseInterceptors, BadRequestException,
} from '@nestjs/common'
import { Response } from 'express'
import { FileInterceptor } from '@nestjs/platform-express'
import { AssignmentRateTypesService } from './assignment-rate-types.service'
import { buildRecordsExcel } from '../common/excel-export.util'

@Controller('assignment-rate-types')
export class AssignmentRateTypesController {
  constructor(private readonly service: AssignmentRateTypesService) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  async upload(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('No se recibió archivo')
    const result = await this.service.uploadExcel(file.buffer)
    return { message: 'Upload completado', ...result }
  }

  @Get('excel')
  async exportExcel(@Res() res: Response) {
    const result: any = await this.service.findAll()
    const rows = Array.isArray(result) ? result : (result?.data ?? [])
    const buffer = await buildRecordsExcel(rows, { sheetName: 'Rate Types', headerColor: 'FF6A1B9A' })
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', 'attachment; filename="assignment-rate-types.xlsx"')
    res.send(buffer)
  }

  @Get()
  findAll() {
    return this.service.findAll()
  }
}

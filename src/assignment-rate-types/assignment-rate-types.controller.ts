import {
  Controller, Post, Get, Res, UploadedFile, Body, Param,
  UseInterceptors, BadRequestException,
} from '@nestjs/common'
import { makeProgressReporter, getUploadProgress } from '../common/upload-progress.util'
import { Response } from 'express'
import { FileInterceptor } from '@nestjs/platform-express'
import { AssignmentRateTypesService } from './assignment-rate-types.service'
import { buildRecordsExcel } from '../common/excel-export.util'

@Controller('assignment-rate-types')
export class AssignmentRateTypesController {
  constructor(private readonly service: AssignmentRateTypesService) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  async upload(@UploadedFile() file: Express.Multer.File, @Body('upload_id') uploadId?: string) {
    if (!file) throw new BadRequestException('No se recibió archivo')
    const report = makeProgressReporter(uploadId)
    try {
      const result = await this.service.uploadExcel(file.buffer, report)
      report({ phase: 'done' })
      return { message: 'Upload completado', ...result }
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

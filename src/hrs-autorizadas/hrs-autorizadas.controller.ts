import { Body, Controller, Post, Res } from '@nestjs/common'
import { Response } from 'express'
import { buildHrsAutorizadasExcel, HrsAutorizadasPayload } from '../common/hrs-autorizadas-excel.util'

@Controller('payroll')
export class HrsAutorizadasController {
  @Post('hrs-autorizadas/excel')
  async exportExcel(@Body() body: HrsAutorizadasPayload, @Res() res: Response) {
    const buffer = await buildHrsAutorizadasExcel(body)
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    )
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="HrsAutorizadas_${body.startDate}_${body.endDate}.xlsx"`,
    )
    res.send(buffer)
  }
}

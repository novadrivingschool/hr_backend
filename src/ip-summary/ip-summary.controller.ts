import { Controller, Get, Query, Res, Headers } from '@nestjs/common'
import { Response } from 'express'
import { IpSummaryService } from './ip-summary.service'

@Controller('instructor-payroll-summary')
export class IpSummaryController {
  constructor(private readonly service: IpSummaryService) {}

  // Misma fuente que el Excel (buildSummaryRows) — la usa la tabla en
  // pantalla y el botón de PDF de HrsAutorizadas.vue, para que ambos formatos
  // muestren siempre exactamente los mismos números.
  @Get('data')
  async getSummaryData(
    @Query('start_date') start_date: string,
    @Query('end_date') end_date: string,
    @Headers('x-rates-token') ratesToken?: string,
  ) {
    const rows = await this.service.buildSummaryRows(start_date, end_date, ratesToken)
    return { rows }
  }

  @Get('excel')
  async exportExcel(
    @Query('start_date') start_date: string,
    @Query('end_date') end_date: string,
    @Res() res: Response,
    @Headers('x-rates-token') ratesToken?: string,
  ) {
    const buffer = await this.service.buildExcel(start_date, end_date, ratesToken)
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    )
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="instructor-payroll-resumen_${start_date}_${end_date}.xlsx"`,
    )
    res.send(buffer)
  }
}

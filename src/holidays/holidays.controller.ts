import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { HolidaysService } from './holidays.service';
import { CreateHolidayDto } from './dto/create-holiday.dto';
import { UpdateHolidayDto } from './dto/update-holiday.dto';

@Controller('holidays')
export class HolidaysController {
  constructor(private readonly holidaysService: HolidaysService) {}

  @Post()
  create(@Body() createHolidayDto: CreateHolidayDto) {
    return this.holidaysService.create(createHolidayDto);
  }

  @Get()
  findAll() {
    return this.holidaysService.findAll();
  }

  @Get('audit-log')
  findAuditLog() {
    return this.holidaysService.findAuditLog();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.holidaysService.findOne(id);
  }

  // Historial del holiday a través de los años (fechas + horas autorizadas),
  // distinto del audit-log general. Ver HolidaysService.findHistory().
  @Get(':id/history')
  findHistory(@Param('id') id: string) {
    return this.holidaysService.findHistory(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateHolidayDto: UpdateHolidayDto) {
    return this.holidaysService.update(id, updateHolidayDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Body() body: { performed_by?: any }) {
    return this.holidaysService.remove(id, body?.performed_by);
  }
}

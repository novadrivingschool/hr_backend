import { Controller, Get, Post, Body, Query, Patch, Param, Delete } from '@nestjs/common';
import { LogbookService } from './logbook.service';
import { CreateLogbookDto } from './dto/create-logbook.dto';
import { FilterLogbookDto } from './dto/filter-logbook.dto';
import { UpdateLogbookDto } from './dto/update-logbook.dto';


@Controller('logbook')
export class LogbookController {
  constructor(private readonly logbookService: LogbookService) { }

  @Post()
  create(@Body() createLogbookDto: CreateLogbookDto) {
    return this.logbookService.create(createLogbookDto);
  }

  @Get()
  findAll() {
    return this.logbookService.findAll();
  }

  @Get('filter')
  findFiltered(@Query() filterDto: FilterLogbookDto) {
    return this.logbookService.findFiltered(filterDto);
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateLogbookDto) {
    return this.logbookService.update(id, dto);
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    return this.logbookService.remove(id);
  }
}

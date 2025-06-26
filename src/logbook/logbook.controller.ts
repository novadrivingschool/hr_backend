import { Controller, Get, Post, Body, Query } from '@nestjs/common';
import { LogbookService } from './logbook.service';
import { CreateLogbookDto } from './dto/create-logbook.dto';
import { FilterLogbookDto } from './dto/filter-logbook.dto';


@Controller('logbook')
export class LogbookController {
  constructor(private readonly logbookService: LogbookService) {}

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
}

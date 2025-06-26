import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { FixedScheduleService } from './fixed_schedule.service';
import { CreateFixedScheduleDto } from './dto/create-fixed_schedule.dto';
import { UpdateFixedScheduleDto } from './dto/update-fixed_schedule.dto';

@Controller('fixed-schedule')
export class FixedScheduleController {
  constructor(private readonly fixedScheduleService: FixedScheduleService) {}

  @Post()
  create(@Body() createFixedScheduleDto: CreateFixedScheduleDto) {
    return this.fixedScheduleService.create(createFixedScheduleDto);
  }

  @Get()
  findAll() {
    return this.fixedScheduleService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.fixedScheduleService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateFixedScheduleDto: UpdateFixedScheduleDto) {
    return this.fixedScheduleService.update(+id, updateFixedScheduleDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.fixedScheduleService.remove(+id);
  }
}

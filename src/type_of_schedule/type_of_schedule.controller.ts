import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { TypeOfScheduleService } from './type_of_schedule.service';
import { CreateTypeOfScheduleDto } from './dto/create-type_of_schedule.dto';
import { UpdateTypeOfScheduleDto } from './dto/update-type_of_schedule.dto';

@Controller('type-of-schedule')
export class TypeOfScheduleController {
  constructor(private readonly typeOfScheduleService: TypeOfScheduleService) {}

  @Post()
  create(@Body() createTypeOfScheduleDto: CreateTypeOfScheduleDto) {
    return this.typeOfScheduleService.create(createTypeOfScheduleDto);
  }

  @Get()
  findAll() {
    return this.typeOfScheduleService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.typeOfScheduleService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateTypeOfScheduleDto: UpdateTypeOfScheduleDto) {
    return this.typeOfScheduleService.update(id, updateTypeOfScheduleDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.typeOfScheduleService.remove(id);
  }
}

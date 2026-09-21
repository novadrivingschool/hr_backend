import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { UseGuards } from '@nestjs/common';
import { HrJwtGuard } from '../common/guards/hr-jwt.guard';
import { PermissionGuard, RequirePermission } from '../common/guards/permission.guard';
import { TypeOfScheduleService } from './type_of_schedule.service';
import { CreateTypeOfScheduleDto } from './dto/create-type_of_schedule.dto';
import { UpdateTypeOfScheduleDto } from './dto/update-type_of_schedule.dto';

@Controller('type-of-schedule')
export class TypeOfScheduleController {
  constructor(private readonly typeOfScheduleService: TypeOfScheduleService) {}

  @UseGuards(HrJwtGuard, PermissionGuard)
  @RequirePermission('it_hr_catalogs')
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

  @UseGuards(HrJwtGuard, PermissionGuard)
  @RequirePermission('it_hr_catalogs')
  @Patch(':id')
  update(@Param('id') id: string, @Body() updateTypeOfScheduleDto: UpdateTypeOfScheduleDto) {
    return this.typeOfScheduleService.update(id, updateTypeOfScheduleDto);
  }

  @UseGuards(HrJwtGuard, PermissionGuard)
  @RequirePermission('it_hr_catalogs')
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.typeOfScheduleService.remove(id);
  }
}

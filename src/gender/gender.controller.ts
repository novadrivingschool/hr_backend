import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { UseGuards } from '@nestjs/common';
import { HrJwtGuard } from '../common/guards/hr-jwt.guard';
import { PermissionGuard, RequirePermission } from '../common/guards/permission.guard';
import { GenderService } from './gender.service';
import { CreateGenderDto } from './dto/create-gender.dto';
import { UpdateGenderDto } from './dto/update-gender.dto';

@Controller('gender')
export class GenderController {
  constructor(private readonly genderService: GenderService) {}

  @UseGuards(HrJwtGuard, PermissionGuard)
  @RequirePermission('it_hr_catalogs')
  @Post()
  create(@Body() createGenderDto: CreateGenderDto) {
    return this.genderService.create(createGenderDto);
  }

  @Get()
  findAll() {
    return this.genderService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.genderService.findOne(id);
  }

  @UseGuards(HrJwtGuard, PermissionGuard)
  @RequirePermission('it_hr_catalogs')
  @Patch(':id')
  update(@Param('id') id: string, @Body() updateGenderDto: UpdateGenderDto) {
    return this.genderService.update(id, updateGenderDto);
  }

  @UseGuards(HrJwtGuard, PermissionGuard)
  @RequirePermission('it_hr_catalogs')
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.genderService.remove(id);
  }
}

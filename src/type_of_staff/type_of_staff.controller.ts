import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { TypeOfStaffService } from './type_of_staff.service';
import { CreateTypeOfStaffDto } from './dto/create-type_of_staff.dto';
import { UpdateTypeOfStaffDto } from './dto/update-type_of_staff.dto';

@Controller('type-of-staff')
export class TypeOfStaffController {
  constructor(private readonly typeOfStaffService: TypeOfStaffService) {}

  @Post()
  create(@Body() createTypeOfStaffDto: CreateTypeOfStaffDto) {
    return this.typeOfStaffService.create(createTypeOfStaffDto);
  }

  @Get()
  findAll() {
    return this.typeOfStaffService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.typeOfStaffService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateTypeOfStaffDto: UpdateTypeOfStaffDto) {
    return this.typeOfStaffService.update(id, updateTypeOfStaffDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.typeOfStaffService.remove(id);
  }
}

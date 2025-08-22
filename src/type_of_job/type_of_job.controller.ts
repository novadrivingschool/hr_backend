import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { TypeOfJobService } from './type_of_job.service';
import { CreateTypeOfJobDto } from './dto/create-type_of_job.dto';
import { UpdateTypeOfJobDto } from './dto/update-type_of_job.dto';

@Controller('type-of-job')
export class TypeOfJobController {
  constructor(private readonly typeOfJobService: TypeOfJobService) {}

  @Post()
  create(@Body() createTypeOfJobDto: CreateTypeOfJobDto) {
    return this.typeOfJobService.create(createTypeOfJobDto);
  }

  @Get()
  findAll() {
    return this.typeOfJobService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.typeOfJobService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateTypeOfJobDto: UpdateTypeOfJobDto) {
    return this.typeOfJobService.update(id, updateTypeOfJobDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.typeOfJobService.remove(id);
  }
}

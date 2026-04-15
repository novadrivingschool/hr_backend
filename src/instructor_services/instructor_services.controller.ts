import { Controller, Get, Post, Body, Patch, Param, Delete, ParseIntPipe } from '@nestjs/common';
import { InstructorServicesService } from './instructor_services.service';
import { CreateInstructorServiceDto } from './dto/create-instructor_service.dto';
import { UpdateInstructorServiceDto } from './dto/update-instructor_service.dto';

@Controller('instructor-services')
export class InstructorServicesController {
  constructor(private readonly instructorServicesService: InstructorServicesService) {}

  @Post()
  create(@Body() createInstructorServiceDto: CreateInstructorServiceDto) {
    return this.instructorServicesService.create(createInstructorServiceDto);
  }

  @Get()
  findAll() {
    return this.instructorServicesService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.instructorServicesService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateInstructorServiceDto: UpdateInstructorServiceDto,
  ) {
    return this.instructorServicesService.update(id, updateInstructorServiceDto);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.instructorServicesService.remove(id);
  }
}
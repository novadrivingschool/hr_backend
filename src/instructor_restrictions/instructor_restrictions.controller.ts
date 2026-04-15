import { Controller, Get, Post, Body, Patch, Param, Delete, ParseIntPipe } from '@nestjs/common';
import { InstructorRestrictionsService } from './instructor_restrictions.service';
import { CreateInstructorRestrictionDto } from './dto/create-instructor_restriction.dto';
import { UpdateInstructorRestrictionDto } from './dto/update-instructor_restriction.dto';

@Controller('instructor-restrictions')
export class InstructorRestrictionsController {
  constructor(private readonly instructorRestrictionsService: InstructorRestrictionsService) {}

  @Post()
  create(@Body() createInstructorRestrictionDto: CreateInstructorRestrictionDto) {
    return this.instructorRestrictionsService.create(createInstructorRestrictionDto);
  }

  @Get()
  findAll() {
    return this.instructorRestrictionsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.instructorRestrictionsService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateInstructorRestrictionDto: UpdateInstructorRestrictionDto,
  ) {
    return this.instructorRestrictionsService.update(id, updateInstructorRestrictionDto);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.instructorRestrictionsService.remove(id);
  }
}
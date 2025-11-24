import { Controller, Get, Post, Body, Patch, Param, Delete, Query } from '@nestjs/common';
import { ChecklistService } from './checklist.service';
import { CreateChecklistDto } from './dto/create-checklist.dto';
import { UpdateChecklistDto } from './dto/update-checklist.dto';
import { QueryFacilityDto } from './dto/query-facility.dto'


@Controller('checklist')
export class ChecklistController {
  constructor(private readonly ChecklistService: ChecklistService) { }

  @Post()
  create(@Body() createFacilityDto: CreateChecklistDto) {
    return this.ChecklistService.create(createFacilityDto)
  }

  @Get()
  findAll(@Query() query: QueryFacilityDto) {
    return this.ChecklistService.findAll(query)
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.ChecklistService.findOne(id)
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateFacilityDto: UpdateChecklistDto) {
    return this.ChecklistService.update(id, updateFacilityDto)
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.ChecklistService.remove(id)
  }
}

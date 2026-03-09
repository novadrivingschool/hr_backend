import { Controller, Get, Post, Body, Patch, Param, Delete, ParseIntPipe, Query } from '@nestjs/common';
import { ICareReasonsService } from './i_care_reasons.service';
import { CreateICareReasonDto } from './dto/create-i_care_reason.dto';
import { UpdateICareReasonDto } from './dto/update-i_care_reason.dto';

@Controller('i-care-reasons')
export class ICareReasonsController {
  constructor(private readonly iCareReasonsService: ICareReasonsService) { }

  @Post()
  create(@Body() createDto: CreateICareReasonDto) {
    return this.iCareReasonsService.create(createDto);
  }

  @Get()
  findAll(@Query('category') category?: string) {
    return this.iCareReasonsService.findAll(category);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.iCareReasonsService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateDto: UpdateICareReasonDto
  ) {
    return this.iCareReasonsService.update(id, updateDto);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.iCareReasonsService.remove(id);
  }
}

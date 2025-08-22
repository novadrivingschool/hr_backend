import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { MaritalStatusService } from './marital_status.service';
import { CreateMaritalStatusDto } from './dto/create-marital_status.dto';
import { UpdateMaritalStatusDto } from './dto/update-marital_status.dto';

@Controller('marital-status')
export class MaritalStatusController {
  constructor(private readonly maritalStatusService: MaritalStatusService) {}

  @Post()
  create(@Body() createMaritalStatusDto: CreateMaritalStatusDto) {
    return this.maritalStatusService.create(createMaritalStatusDto);
  }

  @Get()
  findAll() {
    return this.maritalStatusService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.maritalStatusService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateMaritalStatusDto: UpdateMaritalStatusDto) {
    return this.maritalStatusService.update(id, updateMaritalStatusDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.maritalStatusService.remove(id);
  }
}

import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { EthnicityService } from './ethnicity.service';
import { CreateEthnicityDto } from './dto/create-ethnicity.dto';
import { UpdateEthnicityDto } from './dto/update-ethnicity.dto';

@Controller('ethnicity')
export class EthnicityController {
  constructor(private readonly ethnicityService: EthnicityService) {}

  @Post()
  create(@Body() createEthnicityDto: CreateEthnicityDto) {
    return this.ethnicityService.create(createEthnicityDto);
  }

  @Get()
  findAll() {
    return this.ethnicityService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.ethnicityService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateEthnicityDto: UpdateEthnicityDto) {
    return this.ethnicityService.update(id, updateEthnicityDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.ethnicityService.remove(id);
  }
}

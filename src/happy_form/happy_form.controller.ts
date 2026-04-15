import { Controller, Get, Post, Body, Patch, Param, Delete, ParseIntPipe } from '@nestjs/common';
import { HappyFormService } from './happy_form.service';
import { CreateHappyFormDto } from './dto/create-happy_form.dto';
import { UpdateHappyFormDto } from './dto/update-happy_form.dto';

@Controller('happy-form')
export class HappyFormController {
  constructor(private readonly happyFormService: HappyFormService) {}

  @Post()
  create(@Body() createHappyFormDto: CreateHappyFormDto) {
    return this.happyFormService.create(createHappyFormDto);
  }

  @Get()
  findAll() {
    return this.happyFormService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.happyFormService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number, 
    @Body() updateHappyFormDto: UpdateHappyFormDto
  ) {
    return this.happyFormService.update(id, updateHappyFormDto);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.happyFormService.remove(id);
  }
}
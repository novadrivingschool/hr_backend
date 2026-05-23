import { Controller, Get, Post, Patch, Delete, Body, Param } from '@nestjs/common';
import { DispatchesService } from '../services/dispatches.service';
import { CreateDispatchDto } from '../dto/dispatch/create-dispatch.dto';
import { UpdateDispatchDto } from '../dto/dispatch/update-dispatch.dto';

@Controller('inventory/dispatches')
export class DispatchesController {
  constructor(private readonly service: DispatchesService) {}

  @Post()
  create(@Body() dto: CreateDispatchDto) {
    return this.service.create(dto);
  }

  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateDispatchDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}

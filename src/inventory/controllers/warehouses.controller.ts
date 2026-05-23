import { Controller, Get, Post, Patch, Delete, Body, Param } from '@nestjs/common';
import { WarehousesService } from '../services/warehouses.service';
import { CreateWarehouseDto } from '../dto/warehouse/create-warehouse.dto';
import { UpdateWarehouseDto } from '../dto/warehouse/update-warehouse.dto';

@Controller('inventory/warehouses')
export class WarehousesController {
  constructor(private readonly service: WarehousesService) {}

  @Post()
  create(@Body() dto: CreateWarehouseDto) {
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
  update(@Param('id') id: string, @Body() dto: UpdateWarehouseDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}

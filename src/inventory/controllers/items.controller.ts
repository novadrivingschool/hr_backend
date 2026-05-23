import { Controller, Get, Post, Patch, Delete, Body, Param, Query } from '@nestjs/common';
import { ItemsService } from '../services/items.service';
import { CreateItemDto } from '../dto/item/create-item.dto';
import { UpdateItemDto } from '../dto/item/update-item.dto';
import { QueryItemDto } from '../dto/item/query-item.dto';

@Controller('inventory/items')
export class ItemsController {
  constructor(private readonly service: ItemsService) {}

  @Post()
  create(@Body() dto: CreateItemDto) {
    return this.service.create(dto);
  }

  @Get()
  findAll(@Query() q: QueryItemDto) {
    return this.service.findAll(q);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateItemDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}

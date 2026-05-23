import { Controller, Get, Post, Patch, Delete, Body, Param } from '@nestjs/common';
import { TransfersService } from '../services/transfers.service';
import { CreateTransferDto } from '../dto/transfer/create-transfer.dto';
import { UpdateTransferDto } from '../dto/transfer/update-transfer.dto';

@Controller('inventory/transfers')
export class TransfersController {
  constructor(private readonly service: TransfersService) {}

  @Post()
  create(@Body() dto: CreateTransferDto) {
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
  updateStatus(@Param('id') id: string, @Body() dto: UpdateTransferDto) {
    return this.service.updateStatus(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}

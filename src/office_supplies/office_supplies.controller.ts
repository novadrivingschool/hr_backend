import { Controller, Get, Post, Body, Patch, Param, Delete, Query } from '@nestjs/common'
import { QueryOfficeSupplyDto } from './dto/query-office-supply.dto'
import { OfficeSuppliesService } from './office_supplies.service'
import { CreateOfficeSupplyDto } from './dto/create-office_supply.dto'
import { UpdateOfficeSupplyDto } from './dto/update-office_supply.dto'

@Controller('office-supplies')
export class OfficeSuppliesController {
  constructor(private readonly officeSuppliesService: OfficeSuppliesService) {}

  @Post()
  create(@Body() body: CreateOfficeSupplyDto) {
    // requester VIENE EN EL BODY
    return this.officeSuppliesService.create(body)
  }

  @Get()
  findAll(@Query() q: QueryOfficeSupplyDto) {
    return this.officeSuppliesService.findAll(q)
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.officeSuppliesService.findOne(id)
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: UpdateOfficeSupplyDto) {
    return this.officeSuppliesService.update(id, body)
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.officeSuppliesService.remove(id)
  }
}

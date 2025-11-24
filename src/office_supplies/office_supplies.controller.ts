import { Controller, Get, Post, Body, Patch, Param, Delete, Query } from '@nestjs/common'
import { QueryOfficeSupplyDto } from './dto/query-office-supply.dto'
import { OfficeSuppliesService } from './office_supplies.service'
import { CreateOfficeSupplyDto } from './dto/create-office_supply.dto'
import { UpdateOfficeSupplyDto } from './dto/update-office_supply.dto'

@Controller('office-supplies')
export class OfficeSuppliesController {
  constructor(private readonly officeSuppliesService: OfficeSuppliesService) { }

  @Post()
  async create(@Body() body: CreateOfficeSupplyDto) {
    console.log('🟢 [OfficeSuppliesController] CREATE called')
    console.log('➡️ Body received:', JSON.stringify(body, null, 2))

    try {
      const result = await this.officeSuppliesService.create(body)
      console.log('✅ [OfficeSuppliesController] CREATE result:', result)
      return result
    } catch (err) {
      console.error('❌ [OfficeSuppliesController] CREATE error:', err)
      throw err
    }
  }

  @Get()
  async findAll(@Query() q: QueryOfficeSupplyDto) {
    console.log('🟢 [OfficeSuppliesController] FIND ALL called')
    console.log('➡️ Query params:', q)

    try {
      const result = await this.officeSuppliesService.findAll(q)
      console.log(`✅ [OfficeSuppliesController] FIND ALL returned ${Array.isArray((result as any)?.data) ? (result as any).data.length : 'unknown'} items`)
      return result
    } catch (err) {
      console.error('❌ [OfficeSuppliesController] FIND ALL error:', err)
      throw err
    }
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    console.log('🟢 [OfficeSuppliesController] FIND ONE called with id:', id)

    try {
      const result = await this.officeSuppliesService.findOne(id)
      console.log('✅ [OfficeSuppliesController] FIND ONE result:', result)
      return result
    } catch (err) {
      console.error(`❌ [OfficeSuppliesController] FIND ONE error for id ${id}:`, err)
      throw err
    }
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() body: UpdateOfficeSupplyDto) {
    console.log('🟢 [OfficeSuppliesController] UPDATE called')
    console.log('➡️ ID:', id)
    console.log('➡️ Body received:', JSON.stringify(body, null, 2))

    try {
      const result = await this.officeSuppliesService.update(id, body)
      console.log('✅ [OfficeSuppliesController] UPDATE result:', result)
      return result
    } catch (err) {
      console.error(`❌ [OfficeSuppliesController] UPDATE error for id ${id}:`, err)
      throw err
    }
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    console.log('🟢 [OfficeSuppliesController] REMOVE called with id:', id)

    try {
      const result = await this.officeSuppliesService.remove(id)
      console.log('✅ [OfficeSuppliesController] REMOVE result:', result)
      return result
    } catch (err) {
      console.error(`❌ [OfficeSuppliesController] REMOVE error for id ${id}:`, err)
      throw err
    }
  }
}

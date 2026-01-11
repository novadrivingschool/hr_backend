// src/facilities/facilities.controller.ts
import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseInterceptors,
  UploadedFile,
  ParseFilePipe,
  MaxFileSizeValidator,
  FileTypeValidator,
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { FacilitiesService } from './facilities.service'
import { CreateFacilityDto } from './dto/create-facility.dto'
import { UpdateFacilityDto } from './dto/update-facility.dto'
import { UpdateStatusDto } from './dto/update-status.dto'
import { QueryFacilityDto } from './dto/query-facility.dto'
import { diskStorage } from 'multer'
import { extname } from 'path'
import * as fs from 'fs'
import * as path from 'path'

@Controller('facilities')
export class FacilitiesController {
  constructor(private readonly facilitiesService: FacilitiesService) {}

  @Post()
  create(@Body() createFacilityDto: CreateFacilityDto) {
    return this.facilitiesService.create(createFacilityDto)
  }

  @Get()
  findAll(@Query() query: QueryFacilityDto) {
    return this.facilitiesService.findAll(query)
  }

  @Get('employee/:employee_number')
  findByEmployeeNumber(
    @Param('employee_number') employee_number: string,
    @Query() query: QueryFacilityDto,
  ) {
    return this.facilitiesService.findByEmployeeNumber(employee_number, query)
  }

  @Get('stats')
  getStats() {
    return this.facilitiesService.getStats()
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.facilitiesService.findOne(id)
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateFacilityDto: UpdateFacilityDto) {
    return this.facilitiesService.update(id, updateFacilityDto)
  }

  @Patch(':id/status')
  updateStatus(@Param('id') id: string, @Body() updateStatusDto: UpdateStatusDto) {
    return this.facilitiesService.updateStatus(id, updateStatusDto)
  }

  @Post(':id/upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: './uploads/facilities',
        filename: (req, file, callback) => {
          const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9)
          const ext = extname(file.originalname)
          const filename = `${req.params.id}-${uniqueSuffix}${ext}`
          callback(null, filename)
        },
      }),
    }),
  )
  

  @Delete(':id/attachment/:filename')
  async removeAttachment(
    @Param('id') id: string,
    @Param('filename') filename: string,
  ) {
    const filePath = `./uploads/facilities/${filename}`
    
    // Eliminar archivo físico
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath)
      }
    } catch (error) {
      console.error('Error deleting file:', error)
    }
    
    return this.facilitiesService.removeAttachment(id, `/uploads/facilities/${filename}`)
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.facilitiesService.remove(id)
  }
}
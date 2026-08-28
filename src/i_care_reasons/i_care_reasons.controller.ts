import { Controller, Get, Post, Body, Patch, Param, Delete, ParseIntPipe, Query, Res, UploadedFile, UseInterceptors, BadRequestException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ICareReasonsService } from './i_care_reasons.service';
import { CreateICareReasonDto } from './dto/create-i_care_reason.dto';
import { UpdateICareReasonDto } from './dto/update-i_care_reason.dto';
import { Response } from 'express';

@Controller('i-care-reasons')
export class ICareReasonsController {
  constructor(private readonly iCareReasonsService: ICareReasonsService) { }

  @Post()
  create(@Body() createDto: CreateICareReasonDto) {
    return this.iCareReasonsService.create(createDto);
  }

  @Get()
  findAll(@Query('category') category?: string) {
    return this.iCareReasonsService.findAll(category);
  }

  @Get('export/excel')
  async exportExcel(
    @Res() res: Response,
    @Query('category') category?: string,
  ) {
    return this.iCareReasonsService.exportExcel(res, category);
  }

  @Post('import/excel')
  @UseInterceptors(FileInterceptor('file'))
  async importExcel(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('No file received');
    return this.iCareReasonsService.importExcel(file.buffer);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.iCareReasonsService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateDto: UpdateICareReasonDto
  ) {
    return this.iCareReasonsService.update(id, updateDto);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.iCareReasonsService.remove(id);
  }
}

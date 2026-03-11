import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UsePipes,
  ValidationPipe,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
  ParseIntPipe,
  DefaultValuePipe,
  BadRequestException,
} from '@nestjs/common';
import { ICareService } from './i-care.service';
import { CreateICareDto } from './dto/create-i-care.dto';
import { UpdateICareDto } from './dto/update-i-care.dto';
import { CommitICareDto } from './dto/commit-i-care.dto';
import { ICareStatus, ICareUrgency } from './entities/i-care.entity';

@Controller('i-care')
export class ICareController {
  constructor(private readonly iCareService: ICareService) { }

  // ── POST /i-care ────────────────────────────────────────────────────────────

  @Post()
  @UsePipes(new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  }))
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() createICareDto: CreateICareDto) {
    try {
      const result = await this.iCareService.create(createICareDto);
      console.log('ICare record created:', result.id);
      return result;
    } catch (error) {
      console.error('Error creating ICare record:', error);
      throw error;
    }
  }

  // ── GET /i-care ─────────────────────────────────────────────────────────────

  @Get()
  @HttpCode(HttpStatus.OK)
  async findAll(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(15), ParseIntPipe) limit: number,
  ) {
    try {
      return await this.iCareService.findAll(page, limit);
    } catch (error) {
      console.error('Error fetching ICare records:', error);
      throw error;
    }
  }

  // ── GET /i-care/stats ───────────────────────────────────────────────────────

  @Get('stats')
  @HttpCode(HttpStatus.OK)
  async getStats(
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('submitterEmployeeNumber') submitterEmployeeNumber?: string,
    @Query('staffEmployeeNumber') staffEmployeeNumber?: string,
    @Query('urgency') urgencyRaw?: string,
    @Query('status') statusRaw?: string,       // ← nuevo
    @Query('department') department?: string,
  ) {
    try {
      const urgency = this.parseUrgency(urgencyRaw);
      const status = this.parseStatus(statusRaw);   // ← nuevo

      return await this.iCareService.getStats({
        dateFrom,
        dateTo,
        submitterEmployeeNumber,
        staffEmployeeNumber,
        urgency,
        status,         // ← nuevo
        department,
      });
    } catch (error) {
      console.error('Error fetching ICare statistics:', error);
      throw error;
    }
  }

  // ── GET /i-care/search ──────────────────────────────────────────────────────

  @Get('search')
  @HttpCode(HttpStatus.OK)
  async findByFilters(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(15), ParseIntPipe) limit: number,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('submitterEmployeeNumber') submitterEmployeeNumber?: string,
    @Query('staffEmployeeNumber') staffEmployeeNumber?: string,
    @Query('responsibleEmployeeNumber') responsibleEmployeeNumber?: string,
    @Query('urgency') urgencyRaw?: string,
    @Query('committed') committed?: string,
    @Query('department') department?: string,
    @Query('status') statusRaw?: string,
  ) {
    try {
      const urgency = this.parseUrgency(urgencyRaw);
      const status = this.parseStatus(statusRaw);
      const committedBool =
        committed === 'true' ? true :
          committed === 'false' ? false :
            undefined;

      return await this.iCareService.findByFilters(
        {
          dateFrom,
          dateTo,
          submitterEmployeeNumber,
          staffEmployeeNumber,
          responsibleEmployeeNumber,
          urgency,
          committed: committedBool,
          department,
          status,
        },
        page,
        limit,
      );
    } catch (error) {
      console.error('Error searching ICare records:', error);
      throw error;
    }
  }

  // ── GET /i-care/advanced-search ─────────────────────────────────────────────

  @Get('advanced-search')
  @HttpCode(HttpStatus.OK)
  async search(
    @Query('q') query: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('urgency') urgencyRaw?: string,
  ) {
    try {
      if (!query || query.trim().length < 2) return [];

      const urgency = this.parseUrgency(urgencyRaw);

      return await this.iCareService.search(query.trim(), { dateFrom, dateTo, urgency });
    } catch (error) {
      console.error('Error in advanced search:', error);
      throw error;
    }
  }

  // ── GET /i-care/by-submitter/:employeeNumber ────────────────────────────────

  @Get('by-submitter/:employeeNumber')
  @HttpCode(HttpStatus.OK)
  async findByCurrentSubmitter(@Param('employeeNumber') employeeNumber: string) {
    try {
      return await this.iCareService.findByCurrentSubmitter(employeeNumber);
    } catch (error) {
      console.error('Error fetching ICare records by submitter:', error);
      throw error;
    }
  }

  // ── GET /i-care/by-staff/:employeeNumber ────────────────────────────────────

  @Get('by-staff/:employeeNumber')
  @HttpCode(HttpStatus.OK)
  async findByStaff(@Param('employeeNumber') employeeNumber: string) {
    try {
      return await this.iCareService.findByStaff(employeeNumber);
    } catch (error) {
      console.error('Error fetching ICare records by staff:', error);
      throw error;
    }
  }

  // ── GET /i-care/:id ─────────────────────────────────────────────────────────

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    try {
      return await this.iCareService.findOne(id);
    } catch (error) {
      console.error('Error fetching ICare record:', id, error);
      throw error;
    }
  }

  // ── PATCH /i-care/batch/update ──────────────────────────────────────────────
  // IMPORTANTE: rutas estáticas ANTES de /:id para evitar conflictos

  @Patch('batch/update')
  @HttpCode(HttpStatus.OK)
  async batchUpdate(
    @Body('ids') ids: string[],
    @Body('updates') updates: UpdateICareDto,
  ) {
    try {
      if (!ids || ids.length === 0) {
        throw new BadRequestException('No IDs provided for batch update');
      }
      return await this.iCareService.batchUpdate(ids, updates);
    } catch (error) {
      console.error('Error in batch update:', error);
      throw error;
    }
  }

  // ── PATCH /i-care/:id ───────────────────────────────────────────────────────

  @Patch(':id')
  @UsePipes(new ValidationPipe({
    transform: true,
    skipMissingProperties: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  }))
  @HttpCode(HttpStatus.OK)
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateICareDto: UpdateICareDto,
  ) {
    try {
      if (Object.keys(updateICareDto).length === 0) {
        throw new BadRequestException('No fields provided for update');
      }
      return await this.iCareService.update(id, updateICareDto);
    } catch (error) {
      console.error('Error updating ICare record:', id, error);
      throw error;
    }
  }

  // ── PATCH /i-care/:id/commit ────────────────────────────────────────────────

  @Patch(':id/commit')
  @UsePipes(new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  }))
  @HttpCode(HttpStatus.OK)
  async commit(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() commitDto: CommitICareDto,
  ) {
    try {
      return await this.iCareService.commit(id, commitDto);
    } catch (error) {
      console.error('Error committing ICare record:', id, error);
      throw error;
    }
  }

  // ── DELETE /i-care/batch/delete ─────────────────────────────────────────────

  @Delete('batch/delete')
  @HttpCode(HttpStatus.OK)
  async batchDelete(@Body('ids') ids: string[]) {
    try {
      if (!ids || ids.length === 0) {
        throw new BadRequestException('No IDs provided for batch delete');
      }
      return await this.iCareService.batchDelete(ids);
    } catch (error) {
      console.error('Error in batch delete:', error);
      throw error;
    }
  }

  // ── DELETE /i-care/:id ──────────────────────────────────────────────────────

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    try {
      await this.iCareService.remove(id);
    } catch (error) {
      console.error('Error removing ICare record:', id, error);
      throw error;
    }
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  private parseUrgency(value?: string): ICareUrgency | undefined {
    if (!value) return undefined;
    if (Object.values(ICareUrgency).includes(value as ICareUrgency)) {
      return value as ICareUrgency;
    }
    throw new BadRequestException(
      `Invalid urgency value "${value}". Allowed: ${Object.values(ICareUrgency).join(', ')}`,
    );
  }

  private parseStatus(value?: string): ICareStatus | undefined {
    if (!value) return undefined;
    if (Object.values(ICareStatus).includes(value as ICareStatus)) {
      return value as ICareStatus;
    }
    throw new BadRequestException(
      `Invalid status value "${value}". Allowed: ${Object.values(ICareStatus).join(', ')}`,
    );
  }
}
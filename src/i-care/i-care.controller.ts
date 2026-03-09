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
} from '@nestjs/common';
import { ICareService } from './i-care.service';
import { CreateICareDto } from './dto/create-i-care.dto';
import { UpdateICareDto } from './dto/update-i-care.dto';
import { CommitICareDto } from './dto/commit-i-care.dto';

@Controller('i-care')
export class ICareController {
  constructor(private readonly iCareService: ICareService) {}

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
      console.log('Creating new ICare record:', createICareDto);
      const result = await this.iCareService.create(createICareDto);
      console.log('ICare record created:', result);
      return result;
    } catch (error) {
      console.error('Error creating ICare record:', error);
      throw error;
    }
  }

  // ── GET /i-care ─────────────────────────────────────────────────────────────
  // Devuelve { data: ICare[], total: number }

  @Get()
  @HttpCode(HttpStatus.OK)
  async findAll(
    @Query('page',  new DefaultValuePipe(1),  ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(15), ParseIntPipe) limit: number,
  ) {
    try {
      console.log('Fetching all ICare records — page:', page, 'limit:', limit);
      const result = await this.iCareService.findAll(page, limit);
      console.log('ICare records fetched:', result.total);
      return result;
    } catch (error) {
      console.error('Error fetching ICare records:', error);
      throw error;
    }
  }

  // ── GET /i-care/search ──────────────────────────────────────────────────────
  // Devuelve { data: ICare[], total: number }

  @Get('search')
  @HttpCode(HttpStatus.OK)
  async findByFilters(
    @Query('page',  new DefaultValuePipe(1),  ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(15), ParseIntPipe) limit: number,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('submitterEmployeeNumber') submitterEmployeeNumber?: string,
    @Query('staffEmployeeNumber') staffEmployeeNumber?: string,
    @Query('responsibleEmployeeNumber') responsibleEmployeeNumber?: string,
    @Query('urgency') urgency?: string,
    @Query('committed') committed?: string,
  ) {
    try {
      // El query param llega como string; convertirlo a boolean o undefined
      const committedBool =
        committed === 'true'  ? true  :
        committed === 'false' ? false :
        undefined;

      console.log('Searching ICare records — page:', page, 'limit:', limit, 'filters:', {
        dateFrom,
        dateTo,
        submitterEmployeeNumber,
        staffEmployeeNumber,
        responsibleEmployeeNumber,
        urgency,
        committed: committedBool,
      });

      const result = await this.iCareService.findByFilters(
        {
          dateFrom,
          dateTo,
          submitterEmployeeNumber,
          staffEmployeeNumber,
          responsibleEmployeeNumber,
          urgency,
          committed: committedBool,
        },
        page,
        limit,
      );

      console.log('ICare records found:', result.total);
      return result;
    } catch (error) {
      console.error('Error searching ICare records:', error);
      throw error;
    }
  }

  // ── GET /i-care/by-submitter/:employeeNumber ────────────────────────────────

  @Get('by-submitter/:employeeNumber')
  @HttpCode(HttpStatus.OK)
  async findByCurrentSubmitter(@Param('employeeNumber') employeeNumber: string) {
    try {
      console.log('Fetching ICare records by submitter:', employeeNumber);
      const records = await this.iCareService.findByCurrentSubmitter(employeeNumber);
      console.log('ICare records fetched:', records.length);
      return records;
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
      console.log('Fetching ICare records by staff:', employeeNumber);
      const records = await this.iCareService.findByStaff(employeeNumber);
      console.log('ICare records fetched:', records.length);
      return records;
    } catch (error) {
      console.error('Error fetching ICare records by staff:', error);
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
    @Query('urgency') urgency?: string,
  ) {
    try {
      console.log('Fetching ICare statistics:', {
        dateFrom,
        dateTo,
        submitterEmployeeNumber,
        staffEmployeeNumber,
        urgency,
      });

      const stats = await this.iCareService.getStats({
        dateFrom,
        dateTo,
        submitterEmployeeNumber,
        staffEmployeeNumber,
        urgency,
      });

      console.log('ICare statistics fetched');
      return stats;
    } catch (error) {
      console.error('Error fetching ICare statistics:', error);
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
    @Query('urgency') urgency?: string,
  ) {
    try {
      console.log('Advanced search — query:', query, 'filters:', { dateFrom, dateTo, urgency });

      if (!query || query.trim().length < 2) {
        return [];
      }

      const records = await this.iCareService.search(query.trim(), {
        dateFrom,
        dateTo,
        urgency,
      });

      console.log('Search results:', records.length);
      return records;
    } catch (error) {
      console.error('Error in advanced search:', error);
      throw error;
    }
  }

  // ── GET /i-care/:id ─────────────────────────────────────────────────────────

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    try {
      console.log('Fetching ICare record:', id);
      const record = await this.iCareService.findOne(id);
      console.log('ICare record fetched');
      return record;
    } catch (error) {
      console.error('Error fetching ICare record:', id, error);
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
      console.log('Updating ICare record:', id, updateICareDto);

      if (Object.keys(updateICareDto).length === 0) {
        throw new Error('No fields provided for update');
      }

      const result = await this.iCareService.update(id, updateICareDto);
      console.log('ICare record updated');
      return result;
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
    return this.iCareService.commit(id, commitDto);
  }

  // ── PATCH /i-care/batch/update ──────────────────────────────────────────────

  @Patch('batch/update')
  @HttpCode(HttpStatus.OK)
  async batchUpdate(
    @Body('ids') ids: string[],
    @Body('updates') updates: UpdateICareDto,
  ) {
    try {
      console.log('Batch updating ICare records:', ids.length);

      if (!ids || ids.length === 0) {
        throw new Error('No IDs provided for batch update');
      }

      const result = await this.iCareService.batchUpdate(ids, updates);
      console.log('Batch update completed:', result.updated, 'records updated');
      return result;
    } catch (error) {
      console.error('Error in batch update:', error);
      throw error;
    }
  }

  // ── DELETE /i-care/:id ──────────────────────────────────────────────────────

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    try {
      console.log('Removing ICare record:', id);
      await this.iCareService.remove(id);
      console.log('ICare record removed');
    } catch (error) {
      console.error('Error removing ICare record:', id, error);
      throw error;
    }
  }

  // ── DELETE /i-care/batch/delete ─────────────────────────────────────────────

  @Delete('batch/delete')
  @HttpCode(HttpStatus.OK)
  async batchDelete(@Body('ids') ids: string[]) {
    try {
      console.log('Batch deleting ICare records:', ids.length);

      if (!ids || ids.length === 0) {
        throw new Error('No IDs provided for batch delete');
      }

      const result = await this.iCareService.batchDelete(ids);
      console.log('Batch delete completed:', result.deleted, 'records deleted');
      return result;
    } catch (error) {
      console.error('Error in batch delete:', error);
      throw error;
    }
  }
}
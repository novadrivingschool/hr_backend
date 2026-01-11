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
  Res,
  StreamableFile 
} from '@nestjs/common';
import { ICareService } from './i-care.service';
import { CreateICareDto } from './dto/create-i-care.dto';
import { UpdateICareDto } from './dto/update-i-care.dto';
import { Response } from 'express';

@Controller('i-care')
export class ICareController {
  constructor(private readonly iCareService: ICareService) {}

  @Post()
  @UsePipes(new ValidationPipe({ 
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true 
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
  
  @Get()
  @HttpCode(HttpStatus.OK)
  async findAll() {
    try {
      console.log('Fetching all ICare records');
      const records = await this.iCareService.findAll();
      console.log('ICare records fetched:', records.length);
      return records;
    } catch (error) {
      console.error('Error fetching ICare records:', error);
      throw error;
    }
  }

  @Get('search')
  @HttpCode(HttpStatus.OK)
  async findByFilters(
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('submitterEmployeeNumber') submitterEmployeeNumber?: string,
    @Query('staffEmployeeNumber') staffEmployeeNumber?: string, // NUEVO
    @Query('responsibleEmployeeNumber') responsibleEmployeeNumber?: string,
    @Query('urgency') urgency?: string,
  ) {
    try {
      console.log('Searching ICare records with filters:', { 
        dateFrom, 
        dateTo, 
        submitterEmployeeNumber, 
        staffEmployeeNumber,
        responsibleEmployeeNumber, 
        urgency 
      });
      
      const records = await this.iCareService.findByFilters({
        dateFrom,
        dateTo,
        submitterEmployeeNumber,
        staffEmployeeNumber, // NUEVO
        responsibleEmployeeNumber,
        urgency,
      });
      
      console.log('ICare records found:', records.length);
      return records;
    } catch (error) {
      console.error('Error searching ICare records:', error);
      throw error;
    }
  }

  @Get('by-submitter/:employeeNumber')
  @HttpCode(HttpStatus.OK)
  async findByCurrentSubmitter(@Param('employeeNumber') employeeNumber: string) {
    try {
      console.log('Fetching ICare records by submitter employee number:', employeeNumber);
      const records = await this.iCareService.findByCurrentSubmitter(employeeNumber);
      console.log('ICare records fetched:', records.length);
      return records;
    } catch (error) {
      console.error('Error fetching ICare records by submitter:', error);
      throw error;
    }
  }

  @Get('by-staff/:employeeNumber')
  @HttpCode(HttpStatus.OK)
  async findByStaff(@Param('employeeNumber') employeeNumber: string) {
    try {
      console.log('Fetching ICare records by staff employee number:', employeeNumber);
      const records = await this.iCareService.findByStaff(employeeNumber);
      console.log('ICare records fetched:', records.length);
      return records;
    } catch (error) {
      console.error('Error fetching ICare records by staff:', error);
      throw error;
    }
  }

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
      console.log('Fetching ICare statistics with filters:', { 
        dateFrom, 
        dateTo, 
        submitterEmployeeNumber,
        staffEmployeeNumber,
        urgency 
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

  @Get('advanced-search')
  @HttpCode(HttpStatus.OK)
  async search(
    @Query('q') query: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('urgency') urgency?: string,
  ) {
    try {
      console.log('Advanced search with query:', query, 'and filters:', { dateFrom, dateTo, urgency });
      
      if (!query || query.trim().length < 2) {
        return [];
      }
      
      const records = await this.iCareService.search(query.trim(), {
        dateFrom,
        dateTo,
        urgency,
      });
      
      console.log('Search results found:', records.length);
      return records;
    } catch (error) {
      console.error('Error in advanced search:', error);
      throw error;
    }
  }

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    try {
      console.log('Fetching ICare record with ID:', id);
      const record = await this.iCareService.findOne(id);
      console.log('ICare record fetched');
      return record;
    } catch (error) {
      console.error('Error fetching ICare record with ID:', id, error);
      throw error;
    }
  }

  @Patch(':id')
  @UsePipes(new ValidationPipe({ 
    transform: true,
    skipMissingProperties: true,
    whitelist: true,
    forbidNonWhitelisted: true 
  }))
  @HttpCode(HttpStatus.OK)
  async update(
    @Param('id', ParseUUIDPipe) id: string, 
    @Body() updateICareDto: UpdateICareDto
  ) {
    try {
      console.log('Updating ICare record with ID:', id, 'with data:', updateICareDto);
      
      if (Object.keys(updateICareDto).length === 0) {
        throw new Error('No fields provided for update');
      }
      
      const result = await this.iCareService.update(id, updateICareDto);
      console.log('ICare record updated');
      return result;
    } catch (error) {
      console.error('Error updating ICare record with ID:', id, error);
      throw error;
    }
  }

  @Patch('batch/update')
  @HttpCode(HttpStatus.OK)
  async batchUpdate(
    @Body('ids') ids: string[],
    @Body('updates') updates: UpdateICareDto
  ) {
    try {
      console.log('Batch updating ICare records:', ids.length, 'records');
      
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

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    try {
      console.log('Removing ICare record with ID:', id);
      await this.iCareService.remove(id);
      console.log('ICare record removed');
    } catch (error) {
      console.error('Error removing ICare record with ID:', id, error);
      throw error;
    }
  }

  @Delete('batch/delete')
  @HttpCode(HttpStatus.OK)
  async batchDelete(@Body('ids') ids: string[]) {
    try {
      console.log('Batch deleting ICare records:', ids.length, 'records');
      
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
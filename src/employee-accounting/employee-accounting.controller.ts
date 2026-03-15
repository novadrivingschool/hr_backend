import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
} from '@nestjs/common';
import { EmployeeAccountingService } from './employee-accounting.service';
import { CreateEmployeeAccountingDto } from './dto/create-employee-accounting.dto';
import { UpdateEmployeeAccountingDto } from './dto/update-employee-accounting.dto';

@Controller('employee-accounting')
export class EmployeeAccountingController {
  constructor(private readonly employeeAccountingService: EmployeeAccountingService) {}

  @Post()
  create(@Body() createEmployeeAccountingDto: CreateEmployeeAccountingDto) {
    return this.employeeAccountingService.create(createEmployeeAccountingDto);
  }

  @Get()
  findAll() {
    return this.employeeAccountingService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.employeeAccountingService.findOne(id);
  }

  @Get('employee/:employee_number')
  findByEmployeeNumber(@Param('employee_number') employeeNumber: string) {
    return this.employeeAccountingService.findByEmployeeNumber(employeeNumber);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateEmployeeAccountingDto: UpdateEmployeeAccountingDto,
  ) {
    return this.employeeAccountingService.update(id, updateEmployeeAccountingDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.employeeAccountingService.remove(id);
  }
}
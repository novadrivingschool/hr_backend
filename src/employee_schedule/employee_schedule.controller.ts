import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { EmployeeScheduleService } from './employee_schedule.service';
import { CreateEmployeeScheduleDto } from './dto/create-employee_schedule.dto';
import { UpdateEmployeeScheduleDto } from './dto/update-employee_schedule.dto';
import { EmployeesService } from 'src/employees/employees.service';

@Controller('employee-schedule')
export class EmployeeScheduleController {
  constructor(
    private readonly scheduleService: EmployeeScheduleService,
    private readonly employeeService: EmployeesService
  ) { }

  @Post()
  async create(@Body() dto: CreateEmployeeScheduleDto) {
    console.log('Creating employee schedule:', dto);
    return this.scheduleService.create(dto);
  }

  @Get()
  async findAll() {
    return this.scheduleService.findAll();
  }

  @Get('employee/:employee_number')
  async findByEmployeeNumber(@Param('employee_number') employeeNumber: string) {
    return this.scheduleService.findByEmployeeNumber(employeeNumber);
  }

  @Get('employees/list')
  async getEmployeesList() {
    return this.scheduleService.getEmployeesList();
  }

}

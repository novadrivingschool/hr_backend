import { Controller, Get, Post, Body, Patch, Param, Delete, Query } from '@nestjs/common';
import { EmployeeScheduleService } from './employee_schedule.service';
import { CreateBulkScheduleDto, CreateEmployeeScheduleDto } from './dto/create-employee_schedule.dto';
import { UpdateEmployeeScheduleDto } from './dto/update-employee_schedule.dto';
import { EmployeesService } from 'src/employees/employees.service';
import { FilterEventsDto } from './dto/filter-events.dto';
import { FilterSchedulePanelDto } from './dto/filter-schedule-panel.dto';

@Controller('employee-schedule')
export class EmployeeScheduleController {
  constructor(
    private readonly scheduleService: EmployeeScheduleService,
    private readonly employeeService: EmployeesService
  ) { }

  @Post()
  async create(@Body() dto: CreateEmployeeScheduleDto) {
    console.log("------------------ create -------------------")
    console.log('Creating employee schedule:', dto);
    return this.scheduleService.create(dto);
  }

  @Post('bulk')
  async createBulk(@Body() dto: CreateBulkScheduleDto) {
    console.log('------------------ createBulk -------------------');
    console.log(`Creating schedule for ${dto.employee_numbers.length} employee(s)`);
    return this.scheduleService.createBulk(dto);
  }

  @Post('panel/filter')
  async filterSchedulePanel(@Body() filters: FilterSchedulePanelDto) {
    return this.scheduleService.filterSchedulePanel(filters);
  }

  @Post('employees/by-departments')
  async getEmployeesByDepartments(@Body() body: { departments?: string[] }) {
    return this.scheduleService.getEmployeesListByDepartments(body.departments ?? []);
  }

  @Post('fixed/filter')
  async findFixedSchedules(@Body() body: { employee_number?: string[] }) {
    return this.scheduleService.findFixedSchedules(body.employee_number ?? []);
  }

  @Post('events/filter')
  async findEvents(@Body() filters: FilterEventsDto) {
    return this.scheduleService.findEvents(filters);
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
    console.log('Fetching employees list for');
    return this.scheduleService.getEmployeesList();
  }

  @Delete('events/extra-hours/:uuid')
  async deleteEventsByExtraHours(@Param('uuid') uuid: string) {
    return this.scheduleService.deleteEventsByUuidExtraHours(uuid);
  }
}

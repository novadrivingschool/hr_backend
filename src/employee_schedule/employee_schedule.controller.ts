import { Controller, Get, Post, Body, Patch, Param, Delete, Query, HttpException, HttpStatus } from '@nestjs/common';
import { EmployeeScheduleService } from './employee_schedule.service';
import { CreateBulkScheduleDto, CreateEmployeeScheduleDto } from './dto/create-employee_schedule.dto';
import { UpdateEmployeeScheduleDto } from './dto/update-employee_schedule.dto';
import { EmployeesService } from 'src/employees/employees.service';
import { FilterEventsDto } from './dto/filter-events.dto';
import { FilterSchedulePanelDto } from './dto/filter-schedule-panel.dto';
import axios from 'axios';

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

  @Delete('events/:id')
  async deleteEvent(@Param('id') id: string) {
    console.log('🎯 [controller.deleteEvent] incoming id:', id);
    return this.scheduleService.deleteEvent(Number(id));
  }

  // ── Proxy Vout master schedule → vout-api (backend-to-backend) ──────────
  // El frontend llama este endpoint con el token de Nova. Aquí reenviamos
  // al vout-api usando x-internal-key sin exponer credenciales al browser.
  @Post('vout/panel/filter')
  async voutPanelProxy(@Body() body: { start_date: string; end_date: string }) {
    const voutApi      = process.env.VOUT_API      || '';
    const voutAuthApi  = process.env.VOUT_AUTH_API || '';
    const internalKey  = process.env.INTERNAL_API_KEY || '';

    if (!voutApi) throw new HttpException('VOUT_API not configured', HttpStatus.INTERNAL_SERVER_ERROR);

    const internalHeaders = { 'x-internal-key': internalKey };

    try {
      // 1. Fetch schedule panel from vout-api (internal endpoint, no JWT)
      const scheduleRes = await axios.post(
        `${voutApi}/internal/employee-schedule/panel/filter`,
        { start_date: body.start_date, end_date: body.end_date },
        { headers: internalHeaders, timeout: 15_000 },
      );
      const { employees, events, fixed, meta } = scheduleRes.data;

      // 2. Supplement null employee names from vout-auth-users (internal endpoint)
      let employeesWithNames = Array.isArray(employees) ? employees : [];
      if (voutAuthApi && employeesWithNames.some((e: any) => !e.name)) {
        try {
          const authRes = await axios.get(
            `${voutAuthApi}/users/internal/employees`,
            { params: { key: internalKey }, timeout: 10_000 },
          );
          const nameMap: Record<string, string> = {};
          for (const u of (Array.isArray(authRes.data) ? authRes.data : [])) {
            if (u.employee_number && u.name) nameMap[String(u.employee_number)] = u.name;
          }
          employeesWithNames = employeesWithNames.map((e: any) => ({
            ...e,
            name: e.name || nameMap[String(e.employee_number)] || null,
          }));
        } catch (err) {
          console.warn('[voutPanelProxy] No se pudo obtener nombres del auth service:', err?.message);
        }
      }

      return { employees: employeesWithNames, events, fixed, meta };
    } catch (err: any) {
      const status = err?.response?.status || HttpStatus.BAD_GATEWAY;
      const message = err?.response?.data?.message || err?.message || 'Error al conectar con vout-api';
      throw new HttpException(message, status);
    }
  }
}

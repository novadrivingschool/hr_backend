/* src\employee_schedule\employee_schedule.service.ts */
import { BadRequestException, Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { CreateBulkScheduleDto, CreateEmployeeScheduleDto } from './dto/create-employee_schedule.dto';
import { UpdateEmployeeScheduleDto } from './dto/update-employee_schedule.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { EmployeeSchedule } from './entities/employee_schedule.entity';
import { FixedSchedule } from 'src/fixed_schedule/entities/fixed_schedule.entity';
import { Between, FindOptionsWhere, In, Repository } from 'typeorm';
import { ScheduleEvent } from 'src/schedule_event/entities/schedule_event.entity';
import { Employee } from 'src/employees/entities/employee.entity';
import { FilterEventsDto } from './dto/filter-events.dto';
import { RegisterEnum } from 'src/schedule_event/entities/register.enum';
import { FilterSchedulePanelDto } from './dto/filter-schedule-panel.dto';

@Injectable()
export class EmployeeScheduleService {
  constructor(
    @InjectRepository(EmployeeSchedule)
    private scheduleRepo: Repository<EmployeeSchedule>,
    @InjectRepository(FixedSchedule)
    private fixedRepo: Repository<FixedSchedule>,
    @InjectRepository(ScheduleEvent)
    private eventRepo: Repository<ScheduleEvent>,
    @InjectRepository(Employee)
    private readonly employeeRepo: Repository<Employee>,
  ) { }

  async create(dto: CreateEmployeeScheduleDto): Promise<EmployeeSchedule> {
    console.log('📥 [create] Incoming DTO:', JSON.stringify(dto, null, 2));

    try {
      if (!dto.employee_number) {
        console.error('❌ [create] Employee number is required');
        throw new BadRequestException('Employee number is required');
      }

      // Buscar si ya existe un registro para este empleado
      let schedule = await this.scheduleRepo.findOne({
        where: { employee_number: dto.employee_number },
        relations: ['fixed', 'events'],
      });

      if (!schedule) {
        schedule = this.scheduleRepo.create({
          employee_number: dto.employee_number,
        });
        schedule = await this.scheduleRepo.save(schedule);
      }

      // 🟦 Manejar fixed
      if (dto.fixed?.length) {
        for (const f of dto.fixed) {
          const fixedPayload = {
            ...f,
            strict: f.strict ?? false,
          };

          if (f.id) {
            await this.fixedRepo.update(f.id, fixedPayload);
          } else {
            const newFixed = this.fixedRepo.create({
              ...fixedPayload,
              schedule,
            });
            await this.fixedRepo.save(newFixed);
          }
        }
      }

      // 🟨 Manejar events
      if (dto.events?.length) {
        for (const e of dto.events) {
          if (e.id) {
            await this.eventRepo.update(e.id, e);
          } else {
            const newEvent = this.eventRepo.create({ ...e, schedule });
            await this.eventRepo.save(newEvent);
          }
        }
      }

      // Retornar datos actualizados
      const updated = await this.scheduleRepo.findOne({
        where: { employee_number: dto.employee_number },
        relations: ['fixed', 'events'],
      });

      if (!updated) {
        console.error('❌ [create] Schedule created but failed to fetch updated data for employee:', dto.employee_number);
        throw new InternalServerErrorException('Schedule created but failed to fetch updated data');
      }

      console.log('✅ [create] Schedule successfully created/updated for employee:', dto.employee_number);
      console.log('📤 [create] Result:', JSON.stringify(updated, null, 2));

      return updated;
    } catch (error) {
      console.error('❌ [create] Error creating/updating schedule:', error.message);
      console.error(error.stack);
      throw new InternalServerErrorException('Failed to create/update Employee schedule');
    }
  }



  /* async findAll(): Promise<EmployeeSchedule[]> {
    try {
      return await this.scheduleRepo.find();
    } catch (error) {
      console.error('Error fetching schedules:', error);
      throw new InternalServerErrorException('Failed to retrieve Employee schedules');
    }
  } */
  async findAll(): Promise<Record<string, { fixed: any[]; events: any[] }>> {
    try {
      const schedules = await this.scheduleRepo.find({
        relations: ['fixed', 'events'],
      });

      const response: Record<string, { fixed: any[]; events: any[] }> = {};

      for (const schedule of schedules) {
        response[schedule.employee_number] = {
          fixed: schedule.fixed.map(f => ({
            id: f.id,
            weekdays: f.weekdays,
            start: f.start,
            end: f.end,
            register: f.register,
            location: f.location,
            strict: f.strict,
          })),
          events: schedule.events.map(e => ({
            id: e.id,
            register: e.register,
            date: e.date,
            start: e.start,
            end: e.end,
            location: e.location,
            strict: e.strict,
          })),
        };
      }

      return response;
    } catch (error) {
      console.error('Error fetching all Employee schedules:', error);
      throw new InternalServerErrorException('Failed to retrieve Employee schedules');
    }
  }


  async findByEmployeeNumber(employeeNumber: string): Promise<EmployeeSchedule> {
    try {
      const schedule = await this.scheduleRepo.findOne({
        where: { employee_number: employeeNumber },
      });

      if (!schedule) {
        throw new NotFoundException(`Employee schedule for employee ${employeeNumber} not found`);
      }

      return schedule;
    } catch (error) {
      console.error(`Error fetching schedule for ${employeeNumber}:`, error);
      if (error instanceof NotFoundException) throw error;
      throw new InternalServerErrorException('Failed to retrieve Employee schedule');
    }
  }

  async getEmployeesList() {
    const employees = await this.employeeRepo.find({
      where: { status: 'Active' },
    });

    return employees.map(emp => ({
      employee_number: emp.employee_number,
      name: `${emp.name} ${emp.last_name}`,
      status: emp.status,
      multi_department: emp.multi_department,
      multi_location: emp.multi_location,
      multi_company: emp.multi_company,
    }));
  }

  async findEvents(filters: FilterEventsDto): Promise<Record<string, any>[]> {
    try {
      const where: FindOptionsWhere<ScheduleEvent> = {};

      if (filters.register) {
        where.register = filters.register as RegisterEnum;
      }

      if (filters.start_date && filters.end_date) {
        where.date = Between(filters.start_date, filters.end_date);
      } else if (filters.start_date) {
        where.date = Between(filters.start_date, '9999-12-31');
      } else if (filters.end_date) {
        where.date = Between('0000-01-01', filters.end_date);
      }

      if (filters.employee_number?.length) {
        where.schedule = {
          employee_number: In(filters.employee_number),
        };
      }

      const events = await this.eventRepo.find({
        where,
        relations: ['schedule'],
        order: { date: 'ASC' },
      });

      return events.map(e => ({
        id: e.id,
        employee_number: e.schedule.employee_number,
        register: e.register,
        date: e.date,
        start: e.start,
        end: e.end,
        location: e.location,
        strict: e.strict,
      }));
    } catch (error) {
      console.error('❌ [findEvents] Error filtering events:', error.message);
      throw new InternalServerErrorException('Failed to filter schedule events');
    }
  }

  // employee_schedule.service.ts — agrega este método

  async createBulk(dto: CreateBulkScheduleDto): Promise<{
    success: string[];
    failed: { employee_number: string; error: string }[];
  }> {
    const success: string[] = [];
    const failed: { employee_number: string; error: string }[] = [];

    for (const employee_number of dto.employee_numbers) {
      try {
        await this.create({
          employee_number,
          fixed: dto.fixed ?? [],
          events: dto.events ?? [],
        });
        success.push(employee_number);
      } catch (err) {
        console.warn(`[createBulk] Failed for ${employee_number}: ${err?.message}`);
        failed.push({ employee_number, error: err?.message ?? 'Unknown error' });
      }
    }

    return { success, failed };
  }

  async findFixedSchedules(employee_numbers: string[]): Promise<any[]> {
    const where: FindOptionsWhere<FixedSchedule> = {};

    if (employee_numbers.length) {
      where.schedule = { employee_number: In(employee_numbers) };
    }

    const fixed = await this.fixedRepo.find({
      where,
      relations: ['schedule'],
    });

    return fixed.map(f => ({
      id: f.id,
      employee_number: f.schedule.employee_number,
      weekdays: f.weekdays,
      start: f.start,
      end: f.end,
      register: f.register,
      location: f.location,
      strict: f.strict,
    }));
  }

  async deleteEventsByUuidExtraHours(uuid_extra_hours: string): Promise<{ deleted: number }> {
    const schedule = await this.scheduleRepo
      .createQueryBuilder('s')
      .innerJoin('s.events', 'e')
      .where('e.uuid_extra_hours = :uuid', { uuid: uuid_extra_hours })
      .getOne();

    if (!schedule) {
      return { deleted: 0 };
    }

    const result = await this.eventRepo
      .createQueryBuilder()
      .delete()
      .from(ScheduleEvent)
      .where('"scheduleId" = :scheduleId', { scheduleId: schedule.id })
      .andWhere('uuid_extra_hours = :uuid', { uuid: uuid_extra_hours })
      .execute();

    return { deleted: result.affected ?? 0 };
  }

  async getEmployeesListByDepartments(departments: string[]): Promise<any[]> {
    const qb = this.employeeRepo
      .createQueryBuilder('emp')
      .where('emp.status = :status', { status: 'Active' });

    if (departments.length) {
      // multi_department is JSON; cast to jsonb and check containment for each dept
      const conditions = departments
        .map((_, i) => `emp.multi_department::jsonb @> :dep${i}`)
        .join(' OR ');
      const params = Object.fromEntries(
        departments.map((d, i) => [`dep${i}`, JSON.stringify([d])])
      );
      qb.andWhere(`(${conditions})`, params);
    }

    const employees = await qb.orderBy('emp.name', 'ASC').getMany();

    return employees.map(emp => ({
      employee_number: emp.employee_number,
      name: `${emp.name} ${emp.last_name}`,
      status: emp.status,
      multi_department: emp.multi_department,
      multi_location: emp.multi_location,
      multi_company: emp.multi_company,
    }));
  }

  async filterSchedulePanel(filters: FilterSchedulePanelDto): Promise<{
    employees: Array<{
      employee_number: string;
      name: string;
      status: string;
      multi_department: string[];
      multi_location: string[];
      multi_company: string[];
    }>;
    events: Array<{
      id: number;
      employee_number: string;
      register: RegisterEnum;
      date: string;
      start: string;
      end: string;
      location: string[];
      strict: boolean;
      isFixed: false;
    }>;
    fixed: Array<{
      id: number;
      employee_number: string;
      weekdays: number[];
      start: string;
      end: string;
      register: string;
      location: string[];
      strict: boolean;
      isFixed: true;
    }>;
    meta: {
      total_employees: number;
      total_events: number;
      total_fixed: number;
    };
    work_summary: Record<string, Record<string, {
      work_shift_minutes: number;
      lunch_minutes: number;
      extra_hours_minutes: number;
      time_off_minutes: number;
      work_shift_real_minutes: number;
      work_shift_label: string;
      lunch_label: string;
      extra_hours_label: string;
      time_off_label: string;
      work_shift_real_label: string;
    }>>;
  }> {
    try {
      const {
        start_date,
        end_date,
        employee_number = [],
        departments = [],
        register = [],
        strict,
        isFixed,
      } = filters;

      if (!start_date || !end_date) {
        throw new BadRequestException('start_date and end_date are required');
      }

      if (start_date > end_date) {
        throw new BadRequestException('start_date cannot be greater than end_date');
      }

      // 1) candidatos por empleado/departamento
      const employeeQb = this.employeeRepo
        .createQueryBuilder('emp')
        .where('emp.status = :status', { status: 'Active' });

      if (employee_number.length) {
        employeeQb.andWhere('emp.employee_number IN (:...employeeNumbers)', {
          employeeNumbers: employee_number,
        });
      }

      if (departments.length) {
        const conditions = departments
          .map((_, i) => `emp.multi_department::jsonb @> :dep${i}`)
          .join(' OR ');

        const params = Object.fromEntries(
          departments.map((d, i) => [`dep${i}`, JSON.stringify([d])]),
        );

        employeeQb.andWhere(`(${conditions})`, params);
      }

      const candidateEmployees = await employeeQb
        .orderBy('emp.name', 'ASC')
        .addOrderBy('emp.last_name', 'ASC')
        .getMany();

      if (!candidateEmployees.length) {
        return {
          employees: [],
          events: [],
          fixed: [],
          meta: {
            total_employees: 0,
            total_events: 0,
            total_fixed: 0,
          },
          work_summary: {},
        };
      }

      const candidateEmployeeNumbers = candidateEmployees.map(emp => emp.employee_number);

      // 2) eventos variables
      let events: Array<{
        id: number;
        employee_number: string;
        register: RegisterEnum;
        date: string;
        start: string;
        end: string;
        location: string[];
        strict: boolean;
        isFixed: false;
      }> = [];

      if (isFixed !== true) {
        const eventsQb = this.eventRepo
          .createQueryBuilder('event')
          .innerJoinAndSelect('event.schedule', 'schedule')
          .where('schedule.employee_number IN (:...employeeNumbers)', {
            employeeNumbers: candidateEmployeeNumbers,
          })
          .andWhere('event.date BETWEEN :startDate AND :endDate', {
            startDate: start_date,
            endDate: end_date,
          });

        if (register.length) {
          eventsQb.andWhere('event.register IN (:...registers)', {
            registers: register,
          });
        }

        if (typeof strict === 'boolean') {
          eventsQb.andWhere('event.strict = :strict', { strict });
        }

        const rawEvents = await eventsQb
          .orderBy('event.date', 'ASC')
          .addOrderBy('event.start', 'ASC')
          .getMany();

        events = rawEvents.map(e => ({
          id: e.id,
          employee_number: e.schedule.employee_number,
          register: e.register,
          date: e.date,
          start: e.start,
          end: e.end,
          location: e.location,
          strict: e.strict,
          isFixed: false as const,
        }));
      }

      // 3) fixed schedules
      let fixed: Array<{
        id: number;
        employee_number: string;
        weekdays: number[];
        start: string;
        end: string;
        register: string;
        location: string[];
        strict: boolean;
        isFixed: true;
      }> = [];

      if (isFixed !== false) {
        const fixedQb = this.fixedRepo
          .createQueryBuilder('fixed')
          .innerJoinAndSelect('fixed.schedule', 'schedule')
          .where('schedule.employee_number IN (:...employeeNumbers)', {
            employeeNumbers: candidateEmployeeNumbers,
          });

        if (register.length) {
          fixedQb.andWhere('fixed.register IN (:...registers)', {
            registers: register,
          });
        }

        if (typeof strict === 'boolean') {
          fixedQb.andWhere('fixed.strict = :strict', { strict });
        }

        const rawFixed = await fixedQb
          .orderBy('schedule.employee_number', 'ASC')
          .addOrderBy('fixed.id', 'ASC')
          .getMany();

        // solo fixed que tengan al menos una ocurrencia en el rango pedido
        fixed = rawFixed
          .filter(f => this.fixedMatchesDateRange(f.weekdays, start_date, end_date))
          .map(f => ({
            id: f.id,
            employee_number: f.schedule.employee_number,
            weekdays: f.weekdays,
            start: f.start,
            end: f.end,
            register: f.register,
            location: f.location,
            strict: f.strict,
            isFixed: true as const,
          }));
      }

      // 4) empleados que sí tienen resultados
      const matchedEmployeeNumbers = new Set<string>([
        ...events.map(e => e.employee_number),
        ...fixed.map(f => f.employee_number),
      ]);

      const employees = candidateEmployees
        .filter(emp => matchedEmployeeNumbers.has(emp.employee_number))
        .map(emp => ({
          employee_number: emp.employee_number,
          name: `${emp.name} ${emp.last_name}`.trim(),
          status: emp.status,
          multi_department: emp.multi_department,
          multi_location: emp.multi_location,
          multi_company: emp.multi_company,
        }));

      const work_summary = await this.buildWorkSummary(
        candidateEmployeeNumbers,
        start_date,
        end_date,
      );

      return {
        employees,
        events,
        fixed,
        meta: {
          total_employees: employees.length,
          total_events: events.length,
          total_fixed: fixed.length,
        },
        work_summary,
      };
    } catch (error) {
      console.error('❌ [filterSchedulePanel] Error:', error?.message || error);
      if (error instanceof BadRequestException) throw error;
      throw new InternalServerErrorException('Failed to filter schedule panel');
    }
  }


  private async buildWorkSummary(
    employeeNumbers: string[],
    startDate: string,
    endDate: string,
  ): Promise<Record<string, Record<string, {
    work_shift_minutes: number;
    lunch_minutes: number;
    extra_hours_minutes: number;
    time_off_minutes: number;
    work_shift_real_minutes: number;
    work_shift_label: string;
    lunch_label: string;
    extra_hours_label: string;
    time_off_label: string;
    work_shift_real_label: string;
  }>>> {
    const summary: Record<string, Record<string, {
      work_shift_minutes: number;
      lunch_minutes: number;
      extra_hours_minutes: number;
      time_off_minutes: number;
      work_shift_real_minutes: number;
      work_shift_label: string;
      lunch_label: string;
      extra_hours_label: string;
      time_off_label: string;
      work_shift_real_label: string;
    }>> = {};

    const ensureBucket = (employeeNumber: string, date: string) => {
      if (!summary[employeeNumber]) summary[employeeNumber] = {};
      if (!summary[employeeNumber][date]) {
        summary[employeeNumber][date] = {
          work_shift_minutes: 0,
          lunch_minutes: 0,
          extra_hours_minutes: 0,
          time_off_minutes: 0,
          work_shift_real_minutes: 0,
          work_shift_label: this.formatMinutes(0),
          lunch_label: this.formatMinutes(0),
          extra_hours_label: this.formatMinutes(0),
          time_off_label: this.formatMinutes(0),
          work_shift_real_label: this.formatMinutes(0),
        };
      }
      return summary[employeeNumber][date];
    };

    const rawEvents = await this.eventRepo
      .createQueryBuilder('event')
      .innerJoinAndSelect('event.schedule', 'schedule')
      .where('schedule.employee_number IN (:...employeeNumbers)', {
        employeeNumbers,
      })
      .andWhere('event.date BETWEEN :startDate AND :endDate', {
        startDate,
        endDate,
      })
      .orderBy('event.date', 'ASC')
      .addOrderBy('event.start', 'ASC')
      .getMany();

    for (const event of rawEvents) {
      const employeeNumber = event.schedule.employee_number;
      const bucket = ensureBucket(employeeNumber, event.date);
      const minutes = this.diffDateTimeMinutes(event.start, event.end);

      if (event.register === 'Work Shift') {
        bucket.work_shift_minutes += minutes;
      } else if (event.register === 'Lunch') {
        bucket.lunch_minutes += minutes;
      } else if (event.register === 'Extra Hours') {
        bucket.extra_hours_minutes += minutes;
      } else if (event.register === 'Time Off Request') {
        bucket.time_off_minutes += minutes;
      }
    }

    const rawFixed = await this.fixedRepo
      .createQueryBuilder('fixed')
      .innerJoinAndSelect('fixed.schedule', 'schedule')
      .where('schedule.employee_number IN (:...employeeNumbers)', {
        employeeNumbers,
      })
      .orderBy('fixed.id', 'ASC')
      .getMany();

    const expandedFixed = this.expandFixedForSummary(rawFixed, startDate, endDate);

    for (const item of expandedFixed) {
      const bucket = ensureBucket(item.employee_number, item.date);

      if (item.register === 'Work Shift') {
        bucket.work_shift_minutes += item.minutes;
      } else if (item.register === 'Lunch') {
        bucket.lunch_minutes += item.minutes;
      }
    }

    for (const employeeNumber of Object.keys(summary)) {
      for (const date of Object.keys(summary[employeeNumber])) {
        const bucket = summary[employeeNumber][date];
        bucket.work_shift_real_minutes = Math.max(bucket.work_shift_minutes - bucket.lunch_minutes, 0);
        bucket.work_shift_label = this.formatMinutes(bucket.work_shift_minutes);
        bucket.lunch_label = this.formatMinutes(bucket.lunch_minutes);
        bucket.extra_hours_label = this.formatMinutes(bucket.extra_hours_minutes);
        bucket.time_off_label = this.formatMinutes(bucket.time_off_minutes);
        bucket.work_shift_real_label = this.formatMinutes(bucket.work_shift_real_minutes);
      }
    }

    return summary;
  }

  private expandFixedForSummary(
    fixedSchedules: FixedSchedule[],
    startDate: string,
    endDate: string,
  ): Array<{
    employee_number: string;
    date: string;
    register: string;
    minutes: number;
  }> {
    const result: Array<{
      employee_number: string;
      date: string;
      register: string;
      minutes: number;
    }> = [];

    const current = new Date(`${startDate}T00:00:00.000Z`);
    const end = new Date(`${endDate}T00:00:00.000Z`);

    while (current <= end) {
      const jsDay = current.getUTCDay();
      const isoDay = jsDay === 0 ? 7 : jsDay;
      const date = current.toISOString().slice(0, 10);

      for (const fixed of fixedSchedules) {
        if (!Array.isArray(fixed.weekdays) || !fixed.weekdays.includes(isoDay)) continue;

        result.push({
          employee_number: fixed.schedule.employee_number,
          date,
          register: fixed.register,
          minutes: this.diffTimeStringMinutes(fixed.start, fixed.end),
        });
      }

      current.setUTCDate(current.getUTCDate() + 1);
    }

    return result;
  }

  private diffDateTimeMinutes(start: string | Date, end: string | Date): number {
    const startMs = new Date(start).getTime();
    const endMs = new Date(end).getTime();

    if (Number.isNaN(startMs) || Number.isNaN(endMs) || endMs <= startMs) {
      return 0;
    }

    return Math.round((endMs - startMs) / 60000);
  }

  private diffTimeStringMinutes(start: string, end: string): number {
    const [startHour, startMinute] = (start || '00:00').substring(0, 5).split(':').map(Number);
    const [endHour, endMinute] = (end || '00:00').substring(0, 5).split(':').map(Number);

    const startTotal = (startHour * 60) + startMinute;
    const endTotal = (endHour * 60) + endMinute;

    return Math.max(endTotal - startTotal, 0);
  }

  private formatMinutes(totalMinutes: number): string {
    const total = Number(totalMinutes || 0);

    if (!total) return '0 hrs';
    if (total < 60) return `${total} min`;

    const hours = total / 60;
    if (Number.isInteger(hours)) {
      return `${hours} ${hours === 1 ? 'hr' : 'hrs'}`;
    }

    const compact = hours.toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1');
    return `${compact} hrs`;
  }

  private fixedMatchesDateRange(
    weekdays: number[],
    startDate: string,
    endDate: string,
  ): boolean {
    if (!Array.isArray(weekdays) || !weekdays.length) return false;

    const weekdaySet = new Set(weekdays.map(Number));

    const current = new Date(`${startDate}T00:00:00.000Z`);
    const end = new Date(`${endDate}T00:00:00.000Z`);

    while (current <= end) {
      const jsDay = current.getUTCDay(); // 0=Sun ... 6=Sat
      const isoDay = jsDay === 0 ? 7 : jsDay; // 1=Mon ... 7=Sun

      if (weekdaySet.has(isoDay)) {
        return true;
      }

      current.setUTCDate(current.getUTCDate() + 1);
    }

    return false;
  }

}

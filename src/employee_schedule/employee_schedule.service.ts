/* src\employee_schedule\employee_schedule.service.ts */
import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import {
  CreateBulkScheduleDto,
  CreateEmployeeScheduleDto,
  CreateScheduleEventDto,
} from './dto/create-employee_schedule.dto';
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
import { randomUUID } from 'crypto';

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
        throw new BadRequestException('Employee number is required');
      }

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

      // 🟦 Fixed schedules
      if (dto.fixed?.length) {
        for (const f of dto.fixed) {
          const fixedPayload: Partial<FixedSchedule> = {
            weekdays: f.weekdays,
            start: f.start,
            end: f.end,
            register: f.register,
            location: f.location ?? [],
            strict: f.strict ?? false,
          };

          if (f.id) {
            const existingFixed = await this.fixedRepo.findOne({
              where: { id: f.id },
              relations: ['schedule'],
            });

            if (!existingFixed) {
              throw new NotFoundException(`FixedSchedule with id ${f.id} not found`);
            }

            Object.assign(existingFixed, fixedPayload, { schedule });
            await this.fixedRepo.save(existingFixed);
          } else {
            const newFixed = this.fixedRepo.create({
              ...fixedPayload,
              schedule,
            });
            await this.fixedRepo.save(newFixed);
          }
        }
      }

      // 🟨 Variable events
      if (dto.events?.length) {
        for (const e of dto.events) {
          const existingEvent = e.id
            ? await this.eventRepo.findOne({
              where: { id: e.id },
              relations: ['schedule'],
            })
            : null;

          if (e.id && !existingEvent) {
            throw new NotFoundException(`ScheduleEvent with id ${e.id} not found`);
          }

          const previousTorUuid =
            existingEvent?.register === RegisterEnum.TIME_OFF_REQUEST
              ? existingEvent.uuid_tor
              : null;

          const payload = this.buildScheduleEventPayload(e, existingEvent ?? undefined);

          let savedEvent: ScheduleEvent;

          if (existingEvent) {
            Object.assign(existingEvent, payload, { schedule });
            savedEvent = await this.eventRepo.save(existingEvent);
          } else {
            const newEvent = this.eventRepo.create({
              ...payload,
              schedule,
            });
            savedEvent = await this.eventRepo.save(newEvent);
          }

          // Si antes era TOR y dejó de serlo, o cambió de uuid_tor, limpia sus recoveries anteriores
          if (
            previousTorUuid &&
            (savedEvent.register !== RegisterEnum.TIME_OFF_REQUEST ||
              savedEvent.uuid_tor !== previousTorUuid)
          ) {
            await this.deleteTimeOffRecoveryEvents(schedule.id, previousTorUuid);
          }

          // Si es TOR, sincroniza sus recovery events
          if (savedEvent.register === RegisterEnum.TIME_OFF_REQUEST) {
            await this.syncTimeOffRecoveryEvents(schedule, savedEvent);
          }
        }
      }

      const updated = await this.scheduleRepo.findOne({
        where: { employee_number: dto.employee_number },
        relations: ['fixed', 'events'],
      });

      if (!updated) {
        throw new InternalServerErrorException(
          'Schedule created but failed to fetch updated data',
        );
      }

      console.log(
        '✅ [create] Schedule successfully created/updated for employee:',
        dto.employee_number,
      );

      return updated;
    } catch (error) {
      console.error('❌ [create] Error creating/updating schedule:', error?.message || error);
      console.error(error?.stack);

      if (
        error instanceof BadRequestException ||
        error instanceof NotFoundException
      ) {
        throw error;
      }

      throw new InternalServerErrorException(
        'Failed to create/update Employee schedule',
      );
    }
  }

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
            uuid_tor: e.uuid_tor,
            uuid_extra_hours: e.uuid_extra_hours,
            strict: e.strict,
            is_paid: e.is_paid,
            will_make_up_hours: e.will_make_up_hours,
            make_up_schedule: e.make_up_schedule,
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
        throw new NotFoundException(
          `Employee schedule for employee ${employeeNumber} not found`,
        );
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
        uuid_tor: e.uuid_tor,
        uuid_extra_hours: e.uuid_extra_hours,
        strict: e.strict,
        is_paid: e.is_paid,
        will_make_up_hours: e.will_make_up_hours,
        make_up_schedule: e.make_up_schedule,
      }));
    } catch (error) {
      console.error('❌ [findEvents] Error filtering events:', error.message);
      throw new InternalServerErrorException('Failed to filter schedule events');
    }
  }

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
        failed.push({
          employee_number,
          error: err?.message ?? 'Unknown error',
        });
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

  async getEmployeesListByDepartments(departments: string[]): Promise<any[]> {
    const qb = this.employeeRepo
      .createQueryBuilder('emp')
      .where('emp.status = :status', { status: 'Active' });

    if (departments.length) {
      const conditions = departments
        .map((_, i) => `emp.multi_department::jsonb @> :dep${i}`)
        .join(' OR ');

      const params = Object.fromEntries(
        departments.map((d, i) => [`dep${i}`, JSON.stringify([d])]),
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
      start: string | null;
      end: string | null;
      location: string[];
      uuid_tor: string | null;
      uuid_extra_hours: string | null;
      strict: boolean;
      is_paid: boolean | null;
      will_make_up_hours: boolean | null;
      make_up_schedule: any[] | null;
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
    work_summary: Record<
      string,
      Record<
        string,
        {
          work_shift_minutes: number;
          lunch_minutes: number;
          extra_hours_minutes: number;
          time_off_minutes: number;
          time_off_recovery_minutes: number;
          work_shift_real_minutes: number;
          work_shift_label: string;
          lunch_label: string;
          extra_hours_label: string;
          time_off_label: string;
          time_off_recovery_label: string;
          work_shift_real_label: string;
        }
      >
    >;
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

      const candidateEmployeeNumbers = candidateEmployees.map(
        emp => emp.employee_number,
      );

      let events: Array<{
        id: number;
        employee_number: string;
        register: RegisterEnum;
        date: string;
        start: string | null;
        end: string | null;
        location: string[];
        uuid_tor: string | null;
        uuid_extra_hours: string | null;
        strict: boolean;
        is_paid: boolean | null;
        will_make_up_hours: boolean | null;
        make_up_schedule: any[] | null;
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
          uuid_tor: e.uuid_tor,
          uuid_extra_hours: e.uuid_extra_hours,
          strict: e.strict,
          is_paid: e.is_paid,
          will_make_up_hours: e.will_make_up_hours,
          make_up_schedule: e.make_up_schedule,
          isFixed: false as const,
        }));
      }

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

        fixed = rawFixed
          .filter(f =>
            this.fixedMatchesDateRange(f.weekdays, start_date, end_date),
          )
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

  private buildScheduleEventPayload(
    dto: CreateScheduleEventDto,
    existing?: ScheduleEvent,
  ): Partial<ScheduleEvent> {
    const isTimeOffRequest = dto.register === RegisterEnum.TIME_OFF_REQUEST;
    const isTimeOffRecovery = dto.register === RegisterEnum.TIME_OFF_RECOVERY;
    const isExtraHours = dto.register === RegisterEnum.EXTRA_HOURS;
    const isOff = dto.register === RegisterEnum.OFF;

    const willMakeUpHours = isTimeOffRequest
      ? dto.will_make_up_hours ?? existing?.will_make_up_hours ?? false
      : null;

    const rawMakeUpSchedule = Array.isArray(dto.make_up_schedule)
      ? dto.make_up_schedule
      : Array.isArray(existing?.make_up_schedule)
        ? existing?.make_up_schedule
        : [];

    const normalizedMakeUpSchedule = rawMakeUpSchedule.map(slot => ({
      date: slot.date,
      start: slot.start,
      end: slot.end,
      location: Array.isArray(slot.location) ? slot.location : [],
      strict: slot.strict ?? false,
    }));

    return {
      date: dto.date,
      start: isOff ? null : dto.start,
      end: isOff ? null : dto.end,
      register: dto.register,
      location: Array.isArray(dto.location) ? dto.location : [],
      strict: dto.strict ?? existing?.strict ?? false,

      uuid_tor: isTimeOffRequest
        ? dto.uuid_tor ?? existing?.uuid_tor ?? randomUUID()
        : isTimeOffRecovery
          ? dto.uuid_tor ?? existing?.uuid_tor ?? null
          : null,

      uuid_extra_hours: isExtraHours
        ? dto.uuid_extra_hours ?? existing?.uuid_extra_hours ?? null
        : null,

      is_paid: isTimeOffRequest
        ? dto.is_paid ?? existing?.is_paid ?? false
        : null,

      will_make_up_hours: isTimeOffRequest
        ? willMakeUpHours
        : null,

      make_up_schedule: isTimeOffRequest
        ? willMakeUpHours
          ? normalizedMakeUpSchedule
          : []
        : null,
    };
  }

  private async syncTimeOffRecoveryEvents(
    schedule: EmployeeSchedule,
    torEvent: ScheduleEvent,
  ): Promise<void> {
    const uuidTor = torEvent.uuid_tor;

    if (!uuidTor) return;

    await this.deleteTimeOffRecoveryEvents(schedule.id, uuidTor);

    const slots = Array.isArray(torEvent.make_up_schedule)
      ? torEvent.make_up_schedule
      : [];

    if (!torEvent.will_make_up_hours || !slots.length) {
      return;
    }

    const recoveryEvents = slots.map(slot =>
      this.eventRepo.create({
        schedule,
        register: RegisterEnum.TIME_OFF_RECOVERY,
        date: slot.date,
        start: slot.start,
        end: slot.end,
        location:
          Array.isArray(slot.location) && slot.location.length
            ? slot.location
            : torEvent.location ?? [],
        strict: slot.strict ?? torEvent.strict ?? false,
        uuid_tor: uuidTor,
        uuid_extra_hours: null,
        is_paid: null,
        will_make_up_hours: null,
        make_up_schedule: null,
      }),
    );

    if (recoveryEvents.length) {
      await this.eventRepo.save(recoveryEvents);
    }
  }

  private async deleteTimeOffRecoveryEvents(
    scheduleId: number,
    uuidTor: string,
  ): Promise<void> {
    if (!uuidTor) return;

    await this.eventRepo
      .createQueryBuilder()
      .delete()
      .from(ScheduleEvent)
      .where('"scheduleId" = :scheduleId', { scheduleId })
      .andWhere('uuid_tor = :uuidTor', { uuidTor })
      .andWhere('register = :register', {
        register: RegisterEnum.TIME_OFF_RECOVERY,
      })
      .execute();
  }

  private async buildWorkSummary(
    employeeNumbers: string[],
    startDate: string,
    endDate: string,
  ): Promise<
    Record<
      string,
      Record<
        string,
        {
          work_shift_minutes: number;
          lunch_minutes: number;
          extra_hours_minutes: number;
          time_off_minutes: number;
          time_off_recovery_minutes: number;
          work_shift_real_minutes: number;
          work_shift_label: string;
          lunch_label: string;
          extra_hours_label: string;
          time_off_label: string;
          time_off_recovery_label: string;
          work_shift_real_label: string;
        }
      >
    >
  > {
    const summary: Record<
      string,
      Record<
        string,
        {
          work_shift_minutes: number;
          lunch_minutes: number;
          extra_hours_minutes: number;
          time_off_minutes: number;
          time_off_recovery_minutes: number;
          work_shift_real_minutes: number;
          work_shift_label: string;
          lunch_label: string;
          extra_hours_label: string;
          time_off_label: string;
          time_off_recovery_label: string;
          work_shift_real_label: string;
        }
      >
    > = {};

    const ensureBucket = (employeeNumber: string, date: string) => {
      if (!summary[employeeNumber]) summary[employeeNumber] = {};
      if (!summary[employeeNumber][date]) {
        summary[employeeNumber][date] = {
          work_shift_minutes: 0,
          lunch_minutes: 0,
          extra_hours_minutes: 0,
          time_off_minutes: 0,
          time_off_recovery_minutes: 0,
          work_shift_real_minutes: 0,
          work_shift_label: this.formatMinutes(0),
          lunch_label: this.formatMinutes(0),
          extra_hours_label: this.formatMinutes(0),
          time_off_label: this.formatMinutes(0),
          time_off_recovery_label: this.formatMinutes(0),
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

      if (event.register === RegisterEnum.WORK_SHIFT) {
        bucket.work_shift_minutes += minutes;
      } else if (event.register === RegisterEnum.LUNCH) {
        bucket.lunch_minutes += minutes;
      } else if (event.register === RegisterEnum.EXTRA_HOURS) {
        bucket.extra_hours_minutes += minutes;
      } else if (event.register === RegisterEnum.TIME_OFF_REQUEST) {
        bucket.time_off_minutes += minutes;
      } else if (event.register === RegisterEnum.TIME_OFF_RECOVERY) {
        bucket.time_off_recovery_minutes += minutes;
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

      if (item.register === RegisterEnum.WORK_SHIFT) {
        bucket.work_shift_minutes += item.minutes;
      } else if (item.register === RegisterEnum.LUNCH) {
        bucket.lunch_minutes += item.minutes;
      }
    }

    for (const employeeNumber of Object.keys(summary)) {
      for (const date of Object.keys(summary[employeeNumber])) {
        const bucket = summary[employeeNumber][date];
        bucket.work_shift_real_minutes = Math.max(
          bucket.work_shift_minutes - bucket.lunch_minutes,
          0,
        );
        bucket.work_shift_label = this.formatMinutes(bucket.work_shift_minutes);
        bucket.lunch_label = this.formatMinutes(bucket.lunch_minutes);
        bucket.extra_hours_label = this.formatMinutes(bucket.extra_hours_minutes);
        bucket.time_off_label = this.formatMinutes(bucket.time_off_minutes);
        bucket.time_off_recovery_label = this.formatMinutes(
          bucket.time_off_recovery_minutes,
        );
        bucket.work_shift_real_label = this.formatMinutes(
          bucket.work_shift_real_minutes,
        );
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
        if (!Array.isArray(fixed.weekdays) || !fixed.weekdays.includes(isoDay)) {
          continue;
        }

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

  private diffDateTimeMinutes(
    start: string | Date | null | undefined,
    end: string | Date | null | undefined,
  ): number {
    if (!start || !end) {
      return 0;
    }

    const startMs = new Date(start).getTime();
    const endMs = new Date(end).getTime();

    if (Number.isNaN(startMs) || Number.isNaN(endMs) || endMs <= startMs) {
      return 0;
    }

    return Math.round((endMs - startMs) / 60000);
  }

  private diffTimeStringMinutes(start: string, end: string): number {
    const [startHour, startMinute] = (start || '00:00')
      .substring(0, 5)
      .split(':')
      .map(Number);

    const [endHour, endMinute] = (end || '00:00')
      .substring(0, 5)
      .split(':')
      .map(Number);

    const startTotal = startHour * 60 + startMinute;
    const endTotal = endHour * 60 + endMinute;

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

    const compact = hours
      .toFixed(2)
      .replace(/\.00$/, '')
      .replace(/(\.\d)0$/, '$1');

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
      const jsDay = current.getUTCDay();
      const isoDay = jsDay === 0 ? 7 : jsDay;

      if (weekdaySet.has(isoDay)) {
        return true;
      }

      current.setUTCDate(current.getUTCDate() + 1);
    }

    return false;
  }

  async deleteEvent(eventId: number): Promise<{
    deleted: boolean;
    deleted_recovery_hours: number;
  }> {
    console.log('🗑️ [deleteEvent] START');
    console.log('🗑️ [deleteEvent] incoming eventId:', eventId);

    if (!Number.isInteger(eventId) || eventId <= 0) {
      console.log('❌ [deleteEvent] invalid eventId');
      throw new BadRequestException('A valid event id is required');
    }

    return this.eventRepo.manager.transaction(async manager => {
      const eventRepo = manager.getRepository(ScheduleEvent);

      const event = await eventRepo.findOne({
        where: { id: eventId },
        relations: ['schedule'],
      });

      console.log('🗑️ [deleteEvent] parent event found:', event
        ? {
          id: event.id,
          register: event.register,
          uuid_tor: event.uuid_tor,
          employee_number: event.schedule?.employee_number ?? null,
          schedule_id: event.schedule?.id ?? null,
        }
        : null
      );

      if (!event) {
        console.log('❌ [deleteEvent] parent event not found');
        throw new NotFoundException(`ScheduleEvent with id ${eventId} not found`);
      }

      let deletedRecoveryHours = 0;

      if (
        event.register === RegisterEnum.TIME_OFF_REQUEST &&
        event.uuid_tor
      ) {
        console.log('🧩 [deleteEvent] TOR detected, looking for children...');
        console.log('🧩 [deleteEvent] parent uuid_tor:', event.uuid_tor);

        const recoveryEvents = await eventRepo.find({
          where: {
            uuid_tor: event.uuid_tor,
            register: RegisterEnum.TIME_OFF_RECOVERY,
          },
        });

        console.log(
          '🧩 [deleteEvent] children found:',
          recoveryEvents.map(ev => ({
            id: ev.id,
            register: ev.register,
            uuid_tor: ev.uuid_tor,
            date: ev.date,
            start: ev.start,
            end: ev.end,
          })),
        );

        if (recoveryEvents.length) {
          const recoveryIds = recoveryEvents.map(ev => ev.id);

          console.log('🧩 [deleteEvent] deleting children first, ids:', recoveryIds);

          const recoveryDeleteResult = await eventRepo.delete(recoveryIds);

          deletedRecoveryHours = recoveryDeleteResult.affected ?? 0;

          console.log(
            '✅ [deleteEvent] children deleted count:',
            deletedRecoveryHours,
          );
        } else {
          console.log(
            '⚠️ [deleteEvent] no children found for parent uuid_tor:',
            event.uuid_tor,
          );
        }
      } else {
        console.log('ℹ️ [deleteEvent] event is not TOR or has no uuid_tor');
        console.log('ℹ️ [deleteEvent] register:', event.register);
        console.log('ℹ️ [deleteEvent] uuid_tor:', event.uuid_tor);
      }

      console.log('🗑️ [deleteEvent] deleting parent event id:', event.id);

      const deleteResult = await eventRepo.delete(event.id);

      console.log(
        '✅ [deleteEvent] parent delete affected:',
        deleteResult.affected ?? 0,
      );

      if (!deleteResult.affected) {
        console.log('❌ [deleteEvent] failed deleting parent');
        throw new InternalServerErrorException(
          `Failed to delete ScheduleEvent with id ${eventId}`,
        );
      }

      console.log('🏁 [deleteEvent] FINISHED');
      console.log('🏁 [deleteEvent] result:', {
        deleted: true,
        deleted_recovery_hours: deletedRecoveryHours,
      });

      return {
        deleted: true,
        deleted_recovery_hours: deletedRecoveryHours,
      };
    });
  }

  private async deleteTimeOffRecoveryEventsByUuid(
    uuidTor: string,
  ): Promise<number> {
    if (!uuidTor) return 0;

    const result = await this.eventRepo
      .createQueryBuilder()
      .delete()
      .from(ScheduleEvent)
      .where('uuid_tor = :uuidTor', { uuidTor })
      .andWhere('register = :register', {
        register: RegisterEnum.TIME_OFF_RECOVERY,
      })
      .execute();

    return result.affected ?? 0;
  }
}
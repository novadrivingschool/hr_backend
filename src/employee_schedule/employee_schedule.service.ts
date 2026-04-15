/* src\employee_schedule\employee_schedule.service.ts */
import {
  BadRequestException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import {
  CreateBulkScheduleDto,
  CreateEmployeeScheduleDto,
  CreateScheduleEventDto,
} from './dto/create-employee_schedule.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { EmployeeSchedule } from './entities/employee_schedule.entity';
import { FixedSchedule } from 'src/fixed_schedule/entities/fixed_schedule.entity';
import {
  FindOptionsWhere,
  In,
  ObjectLiteral,
  Repository,
  SelectQueryBuilder,
} from 'typeorm';
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
  ) {}

  private readonly chicagoTimeZone = 'America/Chicago';

  async create(dto: CreateEmployeeScheduleDto): Promise<EmployeeSchedule> {
    console.log('📥 [create] Incoming DTO:', JSON.stringify(dto, null, 2));

    try {
      if (!dto.employee_number) {
        throw this.buildMissingEmployeeNumberException();
      }

      const updated = await this.scheduleRepo.manager.transaction(async manager => {
        const scheduleRepo = manager.getRepository(EmployeeSchedule);
        const fixedRepo = manager.getRepository(FixedSchedule);
        const eventRepo = manager.getRepository(ScheduleEvent);

        let schedule = await scheduleRepo.findOne({
          where: { employee_number: dto.employee_number },
          relations: ['fixed', 'events'],
        });

        if (!schedule) {
          schedule = scheduleRepo.create({
            employee_number: dto.employee_number,
          });
          schedule = await scheduleRepo.save(schedule);
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
              services: f.services ?? null,
              restrictions: f.restrictions ?? null,
              vehicle_drop: f.vehicle_drop ?? null,
              notes: f.notes ?? null,
              strict: f.strict ?? false,
            };

            await this.validateFixedScheduleOverlap({
              schedule,
              employeeNumber: dto.employee_number,
              candidate: {
                id: f.id ?? null,
                ...fixedPayload,
              },
              fixedRepo,
              eventRepo,
              excludeFixedId: f.id ?? undefined,
            });

            if (f.id) {
              const existingFixed = await fixedRepo.findOne({
                where: { id: f.id },
                relations: ['schedule'],
              });

              if (!existingFixed) {
                throw this.buildFixedScheduleNotFoundException(f.id, dto.employee_number);
              }

              Object.assign(existingFixed, fixedPayload, { schedule });
              await fixedRepo.save(existingFixed);
            } else {
              const newFixed = fixedRepo.create({
                ...fixedPayload,
                schedule,
              });
              await fixedRepo.save(newFixed);
            }
          }
        }

        // 🟨 Variable events
        if (dto.events?.length) {
          for (const e of dto.events) {
            const existingEvent = e.id
              ? await eventRepo.findOne({
                  where: { id: e.id },
                  relations: ['schedule'],
                })
              : null;

            if (e.id && !existingEvent) {
              throw this.buildScheduleEventNotFoundException(e.id, dto.employee_number);
            }

            const previousTorUuid =
              existingEvent?.register === RegisterEnum.TIME_OFF_REQUEST
                ? existingEvent.uuid_tor
                : null;

            const payload = this.buildScheduleEventPayload(
              e,
              existingEvent ?? undefined,
            );

            await this.validateScheduleEventOverlap({
              schedule,
              employeeNumber: dto.employee_number,
              candidate: {
                id: existingEvent?.id ?? e.id ?? null,
                ...payload,
              },
              eventRepo,
              fixedRepo,
              excludeEventId: existingEvent?.id ?? undefined,
            });

            let savedEvent: ScheduleEvent;

            if (existingEvent) {
              Object.assign(existingEvent, payload, { schedule });
              savedEvent = await eventRepo.save(existingEvent);
            } else {
              const newEvent = eventRepo.create({
                ...payload,
                schedule,
              });
              savedEvent = await eventRepo.save(newEvent);
            }

            // Si antes era TOR y dejó de serlo, o cambió de uuid_tor, limpia sus recoveries anteriores
            if (
              previousTorUuid &&
              (savedEvent.register !== RegisterEnum.TIME_OFF_REQUEST ||
                savedEvent.uuid_tor !== previousTorUuid)
            ) {
              await this.deleteTimeOffRecoveryEvents(
                schedule.id,
                previousTorUuid,
                eventRepo,
              );
            }

            // Si es TOR, sincroniza sus recovery events
            if (savedEvent.register === RegisterEnum.TIME_OFF_REQUEST) {
              await this.syncTimeOffRecoveryEvents(
                schedule,
                savedEvent,
                eventRepo,
                fixedRepo,
              );
            }
          }
        }

        const refreshed = await scheduleRepo.findOne({
          where: { employee_number: dto.employee_number },
          relations: ['fixed', 'events'],
        });

        if (!refreshed) {
          throw this.buildScheduleSaveFailedException(
            dto.employee_number,
            'The schedule was processed, but the updated data could not be loaded afterwards.',
          );
        }

        return refreshed;
      });

      console.log(
        '✅ [create] Schedule successfully created/updated for employee:',
        dto.employee_number,
      );

      return updated;
    } catch (error) {
      console.error('❌ [create] Error creating/updating schedule:', error?.message || error);
      console.error(error?.stack);

      if (error instanceof HttpException) {
        throw error;
      }

      throw this.buildScheduleSaveFailedException(
        dto.employee_number,
        error,
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
            services: f.services,
            restrictions: f.restrictions,
            vehicle_drop: f.vehicle_drop,
            notes: f.notes,
            strict: f.strict,
          })),
          events: schedule.events.map(e => ({
            id: e.id,
            register: e.register,
            date: e.date,
            start: e.start,
            end: e.end,
            location: e.location,
            services: e.services,
            restrictions: e.restrictions,
            vehicle_drop: e.vehicle_drop,
            notes: e.notes,
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
      multi_position: emp.multi_position,
    }));
  }

  async findEvents(filters: FilterEventsDto): Promise<Record<string, any>[]> {
    try {
      const eventFilters = filters as FilterEventsDto & { notes?: string[] };

      const qb = this.eventRepo
        .createQueryBuilder('event')
        .innerJoinAndSelect('event.schedule', 'schedule');

      if (eventFilters.register) {
        qb.andWhere('event.register = :register', {
          register: eventFilters.register,
        });
      }

      if (eventFilters.start_date && eventFilters.end_date) {
        qb.andWhere('event.date BETWEEN :startDate AND :endDate', {
          startDate: eventFilters.start_date,
          endDate: eventFilters.end_date,
        });
      } else if (eventFilters.start_date) {
        qb.andWhere('event.date >= :startDate', {
          startDate: eventFilters.start_date,
        });
      } else if (eventFilters.end_date) {
        qb.andWhere('event.date <= :endDate', {
          endDate: eventFilters.end_date,
        });
      }

      if (eventFilters.employee_number?.length) {
        qb.andWhere('schedule.employee_number IN (:...employeeNumbers)', {
          employeeNumbers: eventFilters.employee_number,
        });
      }

      this.applyLocationJsonbFilter(qb, 'event.location', 'eventLoc', eventFilters.location);
      this.applyStringInFilter(qb, 'event.services', 'eventServices', eventFilters.services);
      this.applyStringInFilter(
        qb,
        'event.restrictions',
        'eventRestrictions',
        eventFilters.restrictions,
      );
      this.applyStringInFilter(
        qb,
        'event.vehicle_drop',
        'eventVehicleDrops',
        eventFilters.vehicle_drop,
      );
      this.applyStringInFilter(qb, 'event.notes', 'eventNotes', eventFilters.notes);

      const events = await qb
        .orderBy('event.date', 'ASC')
        .addOrderBy('event.start', 'ASC')
        .getMany();

      return events.map(e => ({
        id: e.id,
        employee_number: e.schedule.employee_number,
        register: e.register,
        date: e.date,
        start: e.start,
        end: e.end,
        location: e.location,
        services: e.services,
        restrictions: e.restrictions,
        vehicle_drop: e.vehicle_drop,
        notes: e.notes,
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
    failed: Array<{
      employee_number: string;
      error: string;
      code?: string | null;
      details?: Record<string, any>;
    }>;
  }> {
    const success: string[] = [];
    const failed: Array<{
      employee_number: string;
      error: string;
      code?: string | null;
      details?: Record<string, any>;
    }> = [];

    for (const employee_number of dto.employee_numbers) {
      try {
        await this.create({
          employee_number,
          fixed: dto.fixed ?? [],
          events: dto.events ?? [],
        });
        success.push(employee_number);
      } catch (err) {
        const normalizedError = this.normalizeExceptionResponse(err, employee_number);

        console.warn(
          `[createBulk] Failed for ${employee_number}: ${normalizedError.message}`,
        );

        failed.push({
          employee_number,
          error: normalizedError.message,
          code: normalizedError.code ?? null,
          details: normalizedError,
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
      services: f.services,
      restrictions: f.restrictions,
      vehicle_drop: f.vehicle_drop,
      notes: f.notes,
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
      services: string | null;
      restrictions: string | null;
      vehicle_drop: string | null;
      notes: string | null;
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
      services: string | null;
      restrictions: string | null;
      vehicle_drop: string | null;
      notes: string | null;
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
        location = [],
        services = [],
        restrictions = [],
        vehicle_drop = [],
        notes = [],
        strict,
        isFixed,
      } = filters as FilterSchedulePanelDto & { notes?: string[] };

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
        services: string | null;
        restrictions: string | null;
        vehicle_drop: string | null;
        notes: string | null;
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

        this.applyLocationJsonbFilter(eventsQb, 'event.location', 'eventLoc', location);
        this.applyStringInFilter(eventsQb, 'event.services', 'eventServices', services);
        this.applyStringInFilter(
          eventsQb,
          'event.restrictions',
          'eventRestrictions',
          restrictions,
        );
        this.applyStringInFilter(
          eventsQb,
          'event.vehicle_drop',
          'eventVehicleDrops',
          vehicle_drop,
        );
        this.applyStringInFilter(eventsQb, 'event.notes', 'eventNotes', notes);

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
          services: e.services,
          restrictions: e.restrictions,
          vehicle_drop: e.vehicle_drop,
          notes: e.notes,
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
        services: string | null;
        restrictions: string | null;
        vehicle_drop: string | null;
        notes: string | null;
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

        this.applyLocationJsonbFilter(fixedQb, 'fixed.location', 'fixedLoc', location);
        this.applyStringInFilter(fixedQb, 'fixed.services', 'fixedServices', services);
        this.applyStringInFilter(
          fixedQb,
          'fixed.restrictions',
          'fixedRestrictions',
          restrictions,
        );
        this.applyStringInFilter(
          fixedQb,
          'fixed.vehicle_drop',
          'fixedVehicleDrops',
          vehicle_drop,
        );
        this.applyStringInFilter(fixedQb, 'fixed.notes', 'fixedNotes', notes);

        const rawFixed = await fixedQb
          .orderBy('schedule.employee_number', 'ASC')
          .addOrderBy('fixed.id', 'ASC')
          .getMany();

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
            services: f.services,
            restrictions: f.restrictions,
            vehicle_drop: f.vehicle_drop,
            notes: f.notes,
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

    type PersistedMakeUpScheduleItem = NonNullable<ScheduleEvent['make_up_schedule']>[number];

    const normalizedMakeUpSchedule: PersistedMakeUpScheduleItem[] = rawMakeUpSchedule
      .filter((slot: any) => slot?.date && slot?.start && slot?.end)
      .map((slot: any): PersistedMakeUpScheduleItem => ({
        date: String(slot.date),
        start: String(slot.start),
        end: String(slot.end),
        location: Array.isArray(slot.location)
          ? slot.location.map((value: any) => String(value))
          : [],
        strict: Boolean(slot.strict),
      }));

    return {
      date: dto.date,
      start: isOff ? null : dto.start,
      end: isOff ? null : dto.end,
      register: dto.register,
      location: Array.isArray(dto.location) ? dto.location : [],
      services: dto.services ?? existing?.services ?? null,
      restrictions: dto.restrictions ?? existing?.restrictions ?? null,
      vehicle_drop: dto.vehicle_drop ?? existing?.vehicle_drop ?? null,
      notes: dto.notes ?? existing?.notes ?? null,
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
    eventRepo: Repository<ScheduleEvent>,
    fixedRepo: Repository<FixedSchedule>,
  ): Promise<void> {
    const uuidTor = torEvent.uuid_tor;

    if (!uuidTor) return;

    await this.deleteTimeOffRecoveryEvents(schedule.id, uuidTor, eventRepo);

    const slots = Array.isArray(torEvent.make_up_schedule)
      ? torEvent.make_up_schedule
      : [];

    if (!torEvent.will_make_up_hours || !slots.length) {
      return;
    }

    for (const slot of slots) {
      const recoveryPayload: Partial<ScheduleEvent> = {
        date: slot.date,
        start: slot.start,
        end: slot.end,
        register: RegisterEnum.TIME_OFF_RECOVERY,
        location:
          Array.isArray(slot.location) && slot.location.length
            ? slot.location
            : torEvent.location ?? [],
        services: torEvent.services ?? null,
        restrictions: torEvent.restrictions ?? null,
        vehicle_drop: torEvent.vehicle_drop ?? null,
        notes: torEvent.notes ?? null,
        strict: slot.strict ?? torEvent.strict ?? false,
        uuid_tor: uuidTor,
        uuid_extra_hours: null,
        is_paid: null,
        will_make_up_hours: null,
        make_up_schedule: null,
      };

      await this.validateScheduleEventOverlap({
        schedule,
        employeeNumber: schedule.employee_number,
        candidate: recoveryPayload,
        eventRepo,
        fixedRepo,
      });

      const recoveryEvent = eventRepo.create({
        ...recoveryPayload,
        schedule,
      });

      await eventRepo.save(recoveryEvent);
    }
  }

  private async deleteTimeOffRecoveryEvents(
    scheduleId: number,
    uuidTor: string,
    eventRepo: Repository<ScheduleEvent> = this.eventRepo,
  ): Promise<void> {
    if (!uuidTor) return;

    await eventRepo
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

  private async validateScheduleEventOverlap(params: {
    schedule: EmployeeSchedule;
    employeeNumber: string;
    candidate: Partial<ScheduleEvent> & { id?: number | null };
    eventRepo: Repository<ScheduleEvent>;
    fixedRepo: Repository<FixedSchedule>;
    excludeEventId?: number;
  }): Promise<void> {
    const {
      schedule,
      employeeNumber,
      candidate,
      eventRepo,
      fixedRepo,
      excludeEventId,
    } = params;

    const candidateRange = this.getEventTimeRange(
      candidate.date,
      candidate.start,
      candidate.end,
    );

    if (!candidateRange) {
      return;
    }

    const candidateRegister = String(candidate.register ?? '').trim();

    if (!candidateRegister) {
      return;
    }

    const conflicts: any[] = [];

    const existingEvents = await eventRepo
      .createQueryBuilder('event')
      .where('"scheduleId" = :scheduleId', { scheduleId: schedule.id })
      .andWhere('event.date = :date', { date: candidateRange.date })
      .andWhere('event.start IS NOT NULL')
      .andWhere('event.end IS NOT NULL')
      .orderBy('event.start', 'ASC')
      .getMany();

    for (const existing of existingEvents) {
      if (excludeEventId && existing.id === excludeEventId) {
        continue;
      }

      const existingRange = this.getEventTimeRange(
        existing.date,
        existing.start,
        existing.end,
      );

      if (!existingRange) {
        continue;
      }

      if (this.isAllowedOverlap(candidateRegister, existing.register)) {
        continue;
      }

      if (
        this.timeRangesOverlap(
          candidateRange.startMinutes,
          candidateRange.endMinutes,
          existingRange.startMinutes,
          existingRange.endMinutes,
        )
      ) {
        conflicts.push({
          conflict_type: 'event',
          relation: 'event_vs_event',
          id: existing.id,
          register: existing.register,
          date: existingRange.date,
          weekdays: null,
          start: existingRange.startLabel,
          end: existingRange.endLabel,
          location: existing.location ?? [],
          strict: existing.strict ?? false,
          notes: existing.notes ?? null,
        });
      }
    }

    const candidateWeekday = this.getIsoWeekday(candidateRange.date);

    if (candidateWeekday) {
      const existingFixed = await fixedRepo
        .createQueryBuilder('fixed')
        .where('"scheduleId" = :scheduleId', { scheduleId: schedule.id })
        .andWhere('fixed.start IS NOT NULL')
        .andWhere('fixed.end IS NOT NULL')
        .orderBy('fixed.id', 'ASC')
        .getMany();

      for (const fixed of existingFixed) {
        const fixedRange = this.getFixedTimeRange(
          fixed.weekdays,
          fixed.start,
          fixed.end,
        );

        if (!fixedRange) {
          continue;
        }

        if (!fixedRange.weekdays.includes(candidateWeekday)) {
          continue;
        }

        if (this.isAllowedOverlap(candidateRegister, fixed.register)) {
          continue;
        }

        if (
          this.timeRangesOverlap(
            candidateRange.startMinutes,
            candidateRange.endMinutes,
            fixedRange.startMinutes,
            fixedRange.endMinutes,
          )
        ) {
          conflicts.push({
            conflict_type: 'fixed',
            relation: 'event_vs_fixed',
            id: fixed.id,
            register: fixed.register,
            date: null,
            weekdays: fixedRange.weekdays,
            start: fixedRange.startLabel,
            end: fixedRange.endLabel,
            location: fixed.location ?? [],
            strict: fixed.strict ?? false,
            notes: fixed.notes ?? null,
          });
        }
      }
    }

    if (conflicts.length) {
      throw this.buildScheduleOverlapException({
        employeeNumber,
        attempted: {
          type: 'event',
          id: candidate.id ?? null,
          register: candidateRegister,
          date: candidateRange.date,
          weekdays: null,
          start: candidateRange.startLabel,
          end: candidateRange.endLabel,
          location: Array.isArray(candidate.location) ? candidate.location : [],
          strict: candidate.strict ?? false,
          notes: candidate.notes ?? null,
        },
        conflicts,
      });
    }
  }

  private async validateFixedScheduleOverlap(params: {
    schedule: EmployeeSchedule;
    employeeNumber: string;
    candidate: Partial<FixedSchedule> & { id?: number | null };
    fixedRepo: Repository<FixedSchedule>;
    eventRepo: Repository<ScheduleEvent>;
    excludeFixedId?: number;
  }): Promise<void> {
    const {
      schedule,
      employeeNumber,
      candidate,
      fixedRepo,
      eventRepo,
      excludeFixedId,
    } = params;

    const candidateRange = this.getFixedTimeRange(
      candidate.weekdays,
      candidate.start,
      candidate.end,
    );

    if (!candidateRange) {
      return;
    }

    const candidateRegister = String(candidate.register ?? '').trim();

    if (!candidateRegister) {
      return;
    }

    const conflicts: any[] = [];

    const existingFixed = await fixedRepo
      .createQueryBuilder('fixed')
      .where('"scheduleId" = :scheduleId', { scheduleId: schedule.id })
      .andWhere('fixed.start IS NOT NULL')
      .andWhere('fixed.end IS NOT NULL')
      .orderBy('fixed.id', 'ASC')
      .getMany();

    for (const fixed of existingFixed) {
      if (excludeFixedId && fixed.id === excludeFixedId) {
        continue;
      }

      const fixedRange = this.getFixedTimeRange(
        fixed.weekdays,
        fixed.start,
        fixed.end,
      );

      if (!fixedRange) {
        continue;
      }

      const sharedWeekdays = this.getSharedWeekdays(
        candidateRange.weekdays,
        fixedRange.weekdays,
      );

      if (!sharedWeekdays.length) {
        continue;
      }

      if (this.isAllowedOverlap(candidateRegister, fixed.register)) {
        continue;
      }

      if (
        this.timeRangesOverlap(
          candidateRange.startMinutes,
          candidateRange.endMinutes,
          fixedRange.startMinutes,
          fixedRange.endMinutes,
        )
      ) {
        conflicts.push({
          conflict_type: 'fixed',
          relation: 'fixed_vs_fixed',
          id: fixed.id,
          register: fixed.register,
          date: null,
          weekdays: fixedRange.weekdays,
          shared_weekdays: sharedWeekdays,
          start: fixedRange.startLabel,
          end: fixedRange.endLabel,
          location: fixed.location ?? [],
          strict: fixed.strict ?? false,
          notes: fixed.notes ?? null,
        });
      }
    }

    const existingEvents = await eventRepo
      .createQueryBuilder('event')
      .where('"scheduleId" = :scheduleId', { scheduleId: schedule.id })
      .andWhere('event.start IS NOT NULL')
      .andWhere('event.end IS NOT NULL')
      .orderBy('event.date', 'ASC')
      .addOrderBy('event.start', 'ASC')
      .getMany();

    for (const event of existingEvents) {
      const eventRange = this.getEventTimeRange(
        event.date,
        event.start,
        event.end,
      );

      if (!eventRange) {
        continue;
      }

      const eventWeekday = this.getIsoWeekday(eventRange.date);

      if (!eventWeekday || !candidateRange.weekdays.includes(eventWeekday)) {
        continue;
      }

      if (this.isAllowedOverlap(candidateRegister, event.register)) {
        continue;
      }

      if (
        this.timeRangesOverlap(
          candidateRange.startMinutes,
          candidateRange.endMinutes,
          eventRange.startMinutes,
          eventRange.endMinutes,
        )
      ) {
        conflicts.push({
          conflict_type: 'event',
          relation: 'fixed_vs_event',
          id: event.id,
          register: event.register,
          date: eventRange.date,
          weekdays: null,
          start: eventRange.startLabel,
          end: eventRange.endLabel,
          location: event.location ?? [],
          strict: event.strict ?? false,
          notes: event.notes ?? null,
        });
      }
    }

    if (conflicts.length) {
      throw this.buildScheduleOverlapException({
        employeeNumber,
        attempted: {
          type: 'fixed',
          id: candidate.id ?? null,
          register: candidateRegister,
          date: null,
          weekdays: candidateRange.weekdays,
          start: candidateRange.startLabel,
          end: candidateRange.endLabel,
          location: Array.isArray(candidate.location) ? candidate.location : [],
          strict: candidate.strict ?? false,
          notes: candidate.notes ?? null,
        },
        conflicts,
      });
    }
  }

  private buildScheduleOverlapException(params: {
    employeeNumber: string;
    attempted: Record<string, any>;
    conflicts: Record<string, any>[];
  }): BadRequestException {
    const { employeeNumber, attempted, conflicts } = params;

    const normalizedAttempted =
      this.normalizeScheduleEntryForResponse(attempted) ?? attempted;
    const normalizedConflicts = conflicts.map(conflict =>
      this.normalizeScheduleEntryForResponse(conflict) ?? conflict,
    );

    const attemptedLabel = this.describeScheduleEntry(normalizedAttempted);
    const firstConflict = normalizedConflicts[0] ?? null;
    const firstConflictLabel = firstConflict
      ? this.describeScheduleEntry(firstConflict)
      : 'another schedule entry';

    return new BadRequestException({
      statusCode: 400,
      error: 'Bad Request',
      code: 'SCHEDULE_OVERLAP',
      message: `The schedule could not be saved because ${attemptedLabel} overlaps with ${firstConflictLabel}. Please change the date or time range and try again.`,
      reason: 'The requested time range overlaps with an existing schedule entry.',
      employee_number: employeeNumber,
      attempted: normalizedAttempted,
      conflict_count: normalizedConflicts.length,
      conflicts: normalizedConflicts,
    });
  }

  private buildMissingEmployeeNumberException(): BadRequestException {
    return new BadRequestException({
      statusCode: 400,
      error: 'Bad Request',
      code: 'EMPLOYEE_NUMBER_REQUIRED',
      message: 'The schedule could not be saved because employee_number is required.',
    });
  }

  private buildFixedScheduleNotFoundException(
    fixedId: number,
    employeeNumber: string,
  ): NotFoundException {
    return new NotFoundException({
      statusCode: 404,
      error: 'Not Found',
      code: 'FIXED_SCHEDULE_NOT_FOUND',
      message: `The schedule could not be saved because the fixed schedule with id ${fixedId} was not found.`,
      employee_number: employeeNumber,
      fixed_schedule_id: fixedId,
    });
  }

  private buildScheduleEventNotFoundException(
    eventId: number,
    employeeNumber: string,
  ): NotFoundException {
    return new NotFoundException({
      statusCode: 404,
      error: 'Not Found',
      code: 'SCHEDULE_EVENT_NOT_FOUND',
      message: `The schedule could not be saved because the schedule event with id ${eventId} was not found.`,
      employee_number: employeeNumber,
      schedule_event_id: eventId,
    });
  }

  private buildScheduleSaveFailedException(
    employeeNumber: string | null | undefined,
    error?: unknown,
  ): InternalServerErrorException {
    const detailMessage =
      typeof error === 'string'
        ? error
        : error instanceof Error && error.message
          ? error.message
          : 'Unexpected system error.';

    return new InternalServerErrorException({
      statusCode: 500,
      error: 'Internal Server Error',
      code: 'SCHEDULE_SAVE_FAILED',
      message:
        'The schedule could not be saved because an unexpected system error occurred. No changes were applied. Please try again.',
      detail: detailMessage,
      employee_number: employeeNumber ?? null,
    });
  }

  private normalizeExceptionResponse(
    error: unknown,
    employeeNumber?: string,
  ): Record<string, any> {
    if (error instanceof HttpException) {
      const response = error.getResponse();

      if (typeof response === 'string') {
        return {
          statusCode: error.getStatus(),
          error: error.name,
          code: null,
          message: response,
          employee_number: employeeNumber ?? null,
        };
      }

      if (response && typeof response === 'object') {
        const normalized = {
          ...response,
          statusCode:
            typeof (response as any).statusCode === 'number'
              ? (response as any).statusCode
              : error.getStatus(),
          employee_number:
            (response as any).employee_number ?? employeeNumber ?? null,
        } as Record<string, any>;

        if (normalized.code === 'SCHEDULE_OVERLAP') {
          normalized.attempted =
            this.normalizeScheduleEntryForResponse(normalized.attempted) ??
            normalized.attempted ??
            null;
          normalized.conflicts = Array.isArray(normalized.conflicts)
            ? normalized.conflicts.map((conflict: Record<string, any>) =>
                this.normalizeScheduleEntryForResponse(conflict) ?? conflict,
              )
            : [];
          normalized.conflict_count = Array.isArray(normalized.conflicts)
            ? normalized.conflicts.length
            : 0;
        }

        return normalized;
      }
    }

    if (error instanceof Error) {
      return {
        statusCode: 500,
        error: 'Internal Server Error',
        code: 'SCHEDULE_SAVE_FAILED',
        message: error.message || 'Unexpected system error.',
        employee_number: employeeNumber ?? null,
      };
    }

    return {
      statusCode: 500,
      error: 'Internal Server Error',
      code: 'SCHEDULE_SAVE_FAILED',
      message: 'Unexpected system error.',
      employee_number: employeeNumber ?? null,
    };
  }

  private normalizeScheduleEntryForResponse(
    entry: Record<string, any> | null | undefined,
  ): Record<string, any> | null {
    if (!entry || typeof entry !== 'object') {
      return null;
    }

    const normalized: Record<string, any> = { ...entry };

    const startInfo = this.normalizeDateAndTimeForChicago(
      normalized.date,
      normalized.start,
    );
    const endInfo = this.normalizeDateAndTimeForChicago(
      normalized.date,
      normalized.end,
    );

    if (startInfo?.date || endInfo?.date) {
      normalized.date =
        startInfo?.date ?? endInfo?.date ?? normalized.date ?? null;
    }

    if (startInfo?.time) {
      normalized.start = startInfo.time;
    }

    if (endInfo?.time) {
      normalized.end = endInfo.time;
    }

    if (Array.isArray(normalized.make_up_schedule)) {
      normalized.make_up_schedule = normalized.make_up_schedule.map((slot: any) => {
        const normalizedSlot = this.normalizeScheduleEntryForResponse(slot);
        return normalizedSlot ?? slot;
      });
    }

    return normalized;
  }

  private normalizeDateAndTimeForChicago(
    dateValue: string | Date | null | undefined,
    timeValue: string | Date | null | undefined,
  ): {
    date: string | null;
    time: string | null;
  } | null {
    if (!timeValue) {
      return null;
    }

    const absoluteDate = this.parseAbsoluteDateValue(timeValue);

    if (absoluteDate) {
      return this.formatDateTimeToChicago(absoluteDate);
    }

    const timeLabel = this.extractTimeLabel(timeValue);

    if (!timeLabel) {
      return null;
    }

    return {
      date: this.normalizeDateOnly(dateValue),
      time: timeLabel,
    };
  }

  private parseAbsoluteDateValue(
    value: string | Date | null | undefined,
  ): Date | null {
    if (!value) {
      return null;
    }

    if (value instanceof Date) {
      return Number.isNaN(value.getTime()) ? null : value;
    }

    const raw = String(value).trim();

    if (!raw) {
      return null;
    }

    if (/^\d{2}:\d{2}(:\d{2})?$/.test(raw)) {
      return null;
    }

    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      return null;
    }

    if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2})?(\.\d{1,3})?([zZ]|[+\-]\d{2}:\d{2})$/.test(raw)) {
      const parsed = new Date(raw.replace(' ', 'T'));
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    }

    if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2})?(\.\d{1,3})?$/.test(raw)) {
      const parsed = new Date(`${raw.replace(' ', 'T')}Z`);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    }

    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  private formatDateTimeToChicago(
    value: Date,
  ): { date: string; time: string } | null {
    if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
      return null;
    }

    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: this.chicagoTimeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      hourCycle: 'h23',
    }).formatToParts(value);

    const partMap = Object.fromEntries(
      parts.map(part => [part.type, part.value]),
    ) as Record<string, string>;

    if (
      !partMap.year ||
      !partMap.month ||
      !partMap.day ||
      !partMap.hour ||
      !partMap.minute
    ) {
      return null;
    }

    return {
      date: `${partMap.year}-${partMap.month}-${partMap.day}`,
      time: `${partMap.hour}:${partMap.minute}`,
    };
  }

  private describeScheduleEntry(entry: Record<string, any> | null | undefined): string {
    if (!entry) {
      return 'the requested schedule entry';
    }

    const normalized = this.normalizeScheduleEntryForResponse(entry) ?? entry;

    const register = String(normalized.register ?? 'schedule entry')
      .replace(/_/g, ' ')
      .toLowerCase();
    const date = normalized.date ? ` on ${normalized.date}` : '';
    const start = normalized.start ? String(normalized.start) : null;
    const end = normalized.end ? String(normalized.end) : null;
    const timeRange = start && end ? ` from ${start} to ${end}` : '';

    return `the ${register}${date}${timeRange}`;
  }

  private getEventTimeRange(
    dateValue: string | Date | null | undefined,
    startValue: string | Date | null | undefined,
    endValue: string | Date | null | undefined,
  ): {
    date: string;
    startLabel: string;
    endLabel: string;
    startMinutes: number;
    endMinutes: number;
  } | null {
    const startInfo = this.normalizeDateAndTimeForChicago(
      dateValue ?? startValue,
      startValue,
    );
    const endInfo = this.normalizeDateAndTimeForChicago(
      dateValue ?? endValue ?? startValue,
      endValue,
    );

    const date =
      startInfo?.date ??
      endInfo?.date ??
      this.normalizeDateOnly(dateValue ?? startValue);

    if (!date || !startInfo?.time || !endInfo?.time) {
      return null;
    }

    const startLabel = startInfo.time;
    const endLabel = endInfo.time;

    const startMinutes = this.timeLabelToMinutes(startLabel);
    const endMinutes = this.timeLabelToMinutes(endLabel);

    if (
      startMinutes === null ||
      endMinutes === null ||
      endMinutes <= startMinutes
    ) {
      return null;
    }

    return {
      date,
      startLabel,
      endLabel,
      startMinutes,
      endMinutes,
    };
  }

  private getFixedTimeRange(
    weekdays: number[] | null | undefined,
    startValue: string | null | undefined,
    endValue: string | null | undefined,
  ): {
    weekdays: number[];
    startLabel: string;
    endLabel: string;
    startMinutes: number;
    endMinutes: number;
  } | null {
    const normalizedWeekdays = Array.isArray(weekdays)
      ? [...new Set(weekdays.map(value => Number(value)).filter(value => value >= 1 && value <= 7))]
      : [];

    if (!normalizedWeekdays.length || !startValue || !endValue) {
      return null;
    }

    const startLabel = this.extractTimeLabel(startValue);
    const endLabel = this.extractTimeLabel(endValue);

    if (!startLabel || !endLabel) {
      return null;
    }

    const startMinutes = this.timeLabelToMinutes(startLabel);
    const endMinutes = this.timeLabelToMinutes(endLabel);

    if (
      startMinutes === null ||
      endMinutes === null ||
      endMinutes <= startMinutes
    ) {
      return null;
    }

    return {
      weekdays: normalizedWeekdays,
      startLabel,
      endLabel,
      startMinutes,
      endMinutes,
    };
  }

  private normalizeDateOnly(value: string | Date | null | undefined): string | null {
    if (!value) {
      return null;
    }

    if (value instanceof Date) {
      if (Number.isNaN(value.getTime())) return null;
      return value.toISOString().slice(0, 10);
    }

    const raw = String(value).trim();

    if (!raw) {
      return null;
    }

    const dateMatch = raw.match(/^(\d{4}-\d{2}-\d{2})/);

    if (dateMatch) {
      return dateMatch[1];
    }

    const parsed = new Date(raw);

    if (Number.isNaN(parsed.getTime())) {
      return null;
    }

    return parsed.toISOString().slice(0, 10);
  }

  private extractTimeLabel(value: string | Date | null | undefined): string | null {
    if (!value) {
      return null;
    }

    if (value instanceof Date) {
      if (Number.isNaN(value.getTime())) return null;
      const hours = `${value.getHours()}`.padStart(2, '0');
      const minutes = `${value.getMinutes()}`.padStart(2, '0');
      return `${hours}:${minutes}`;
    }

    const raw = String(value).trim();

    if (!raw) {
      return null;
    }

    const timeMatch = raw.match(/(\d{2}):(\d{2})/);

    if (!timeMatch) {
      return null;
    }

    return `${timeMatch[1]}:${timeMatch[2]}`;
  }

  private timeLabelToMinutes(value: string | null | undefined): number | null {
    if (!value) {
      return null;
    }

    const [hourText, minuteText] = value.split(':');
    const hour = Number(hourText);
    const minute = Number(minuteText);

    if (
      Number.isNaN(hour) ||
      Number.isNaN(minute) ||
      hour < 0 ||
      hour > 23 ||
      minute < 0 ||
      minute > 59
    ) {
      return null;
    }

    return hour * 60 + minute;
  }

  private timeRangesOverlap(
    startA: number,
    endA: number,
    startB: number,
    endB: number,
  ): boolean {
    return startA < endB && endA > startB;
  }

  private getIsoWeekday(dateValue: string | Date | null | undefined): number | null {
    const date = this.normalizeDateOnly(dateValue);

    if (!date) {
      return null;
    }

    const current = new Date(`${date}T00:00:00.000Z`);

    if (Number.isNaN(current.getTime())) {
      return null;
    }

    const jsDay = current.getUTCDay();
    return jsDay === 0 ? 7 : jsDay;
  }

  private getSharedWeekdays(
    left: number[] | null | undefined,
    right: number[] | null | undefined,
  ): number[] {
    if (!Array.isArray(left) || !Array.isArray(right)) {
      return [];
    }

    const rightSet = new Set(right.map(value => Number(value)));
    return [...new Set(left.map(value => Number(value)).filter(value => rightSet.has(value)))];
  }

  private isAllowedOverlap(
    registerA: string | null | undefined,
    registerB: string | null | undefined,
  ): boolean {
    const left = String(registerA ?? '').trim();
    const right = String(registerB ?? '').trim();

    if (!left || !right) {
      return false;
    }

    const allowedPairs = new Set([
      [RegisterEnum.WORK_SHIFT, RegisterEnum.LUNCH].sort().join('|'),
    ]);

    return allowedPairs.has([left, right].sort().join('|'));
  }

  private applyLocationJsonbFilter<T extends ObjectLiteral>(
    qb: SelectQueryBuilder<T>,
    column: string,
    paramPrefix: string,
    values?: string[],
  ): void {
    if (!values?.length) return;

    const cleanValues = values
      .map(value => String(value ?? '').trim())
      .filter(Boolean);

    if (!cleanValues.length) return;

    const conditions = cleanValues
      .map((_, i) => `${column}::jsonb @> :${paramPrefix}${i}`)
      .join(' OR ');

    const params = Object.fromEntries(
      cleanValues.map((value, i) => [`${paramPrefix}${i}`, JSON.stringify([value])]),
    );

    qb.andWhere(`(${conditions})`, params);
  }

  private applyStringInFilter<T extends ObjectLiteral>(
    qb: SelectQueryBuilder<T>,
    column: string,
    paramName: string,
    values?: string[],
  ): void {
    if (!values?.length) return;

    const cleanValues = values
      .map(value => String(value ?? '').trim())
      .filter(Boolean);

    if (!cleanValues.length) return;

    qb.andWhere(`${column} IN (:...${paramName})`, {
      [paramName]: cleanValues,
    });
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

      console.log(
        '🗑️ [deleteEvent] parent event found:',
        event
          ? {
              id: event.id,
              register: event.register,
              uuid_tor: event.uuid_tor,
              employee_number: event.schedule?.employee_number ?? null,
              schedule_id: event.schedule?.id ?? null,
            }
          : null,
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

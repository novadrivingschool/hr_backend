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
          if (f.id) {
            await this.fixedRepo.update(f.id, f);
          } else {
            const newFixed = this.fixedRepo.create({ ...f, schedule });
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
          })),
          events: schedule.events.map(e => ({
            id: e.id,
            register: e.register,
            date: e.date,
            start: e.start,
            end: e.end,
            location: e.location,
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

}

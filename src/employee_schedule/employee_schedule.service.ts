import { BadRequestException, Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { CreateEmployeeScheduleDto } from './dto/create-employee_schedule.dto';
import { UpdateEmployeeScheduleDto } from './dto/update-employee_schedule.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { EmployeeSchedule } from './entities/employee_schedule.entity';
import { FixedSchedule } from 'src/fixed_schedule/entities/fixed_schedule.entity';
import { Repository } from 'typeorm';
import { ScheduleEvent } from 'src/schedule_event/entities/schedule_event.entity';
import { Employee } from 'src/employees/entities/employee.entity';

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

  /* async create(dto: CreateEmployeeScheduleDto): Promise<EmployeeSchedule> {
    console.log('Creating/updating Employee schedule with DTO:', dto);
    try {
      if (!dto.employee_number) {
        throw new BadRequestException('Employee number is required');
      }

      // Buscar si ya existe un registro para este empleado
      let schedule = await this.scheduleRepo.findOne({
        where: { employee_number: dto.employee_number },
        relations: ['fixed', 'events'],
      });

      if (!schedule) {
        // Si no existe, crear nuevo
        schedule = this.scheduleRepo.create({
          employee_number: dto.employee_number,
        });
        schedule = await this.scheduleRepo.save(schedule);
      }

      // 🟦 Manejar fixed
      if (dto.fixed?.length) {
        for (const f of dto.fixed) {
          if (f.id) {
            // Update
            await this.fixedRepo.update(f.id, f);
          } else {
            // Create
            const newFixed = this.fixedRepo.create({ ...f, schedule });
            await this.fixedRepo.save(newFixed);
          }
        }
      }

      // 🟨 Manejar events
      if (dto.events?.length) {
        for (const e of dto.events) {
          if (e.id) {
            // Update
            await this.eventRepo.update(e.id, e);
          } else {
            // Create
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
        throw new InternalServerErrorException('Schedule created but failed to fetch updated data');
      }

      return updated;
    } catch (error) {
      console.error('Error in schedule creation:', error);
      throw new InternalServerErrorException('Failed to create/update Employee schedule');
    }
  } */
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
      department: emp.department,
      country: emp.country,
      company: emp.company,
    }));
  }

}

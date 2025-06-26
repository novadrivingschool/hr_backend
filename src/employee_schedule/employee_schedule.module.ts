import { Module } from '@nestjs/common';
import { EmployeeScheduleService } from './employee_schedule.service';
import { EmployeeScheduleController } from './employee_schedule.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EmployeeSchedule } from './entities/employee_schedule.entity';
import { FixedSchedule } from 'src/fixed_schedule/entities/fixed_schedule.entity';
import { ScheduleEvent } from 'src/schedule_event/entities/schedule_event.entity';
import { EmployeesModule } from 'src/employees/employees.module';
import { Employee } from 'src/employees/entities/employee.entity';

@Module({
  imports: [TypeOrmModule.forFeature([
    EmployeeSchedule,
    FixedSchedule,
    ScheduleEvent,
    Employee
  ]),
    EmployeesModule,
  ],
  controllers: [EmployeeScheduleController],
  providers: [EmployeeScheduleService],
  exports: [EmployeeScheduleService],
})
export class EmployeeScheduleModule { }

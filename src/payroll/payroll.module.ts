import { Module } from '@nestjs/common';
import { PayrollService } from './payroll.service';
import { PayrollController } from './payroll.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EmployeeSchedule } from 'src/employee_schedule/entities/employee_schedule.entity';
import { FixedSchedule } from 'src/fixed_schedule/entities/fixed_schedule.entity';
import { ScheduleEvent } from 'src/schedule_event/entities/schedule_event.entity';
import { Employee } from 'src/employees/entities/employee.entity';
import { EmployeesModule } from 'src/employees/employees.module';
import { MulterModule } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { Timesheet } from './entities/timesheet.entity';
import { Holiday } from 'src/holidays/entities/holiday.entity';
import { TimesheetRecord } from 'src/timesheet-records/entities/timesheet-record.entity';

@Module({
  controllers: [PayrollController],
  providers: [PayrollService],
  imports: [TypeOrmModule.forFeature([
    EmployeeSchedule,
    FixedSchedule,
    ScheduleEvent,
    Employee,
    Timesheet,
    Holiday,
    TimesheetRecord
  ]),
    EmployeesModule,
  MulterModule.register({
    storage: memoryStorage(), // guardamos en memoria, no en disco
  }),
  ],
})
export class PayrollModule { }

import { Module } from '@nestjs/common';
import { TimeOffRequestService } from './time_off_request.service';
import { TimeOffRequestController } from './time_off_request.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TimeOffRequest } from './entities/time_off_request.entity';
import { EmployeesModule } from 'src/employees/employees.module';
import { EmployeeScheduleModule } from 'src/employee_schedule/employee_schedule.module';
import { ScheduleEvent } from 'src/schedule_event/entities/schedule_event.entity';
import { EmployeeSchedule } from 'src/employee_schedule/entities/employee_schedule.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      TimeOffRequest,
      ScheduleEvent,
      EmployeeSchedule,
    ]),
    EmployeesModule,
    EmployeeScheduleModule,
  ],
  controllers: [TimeOffRequestController],
  providers: [TimeOffRequestService],
  exports: [TimeOffRequestService],
})
export class TimeOffRequestModule { }

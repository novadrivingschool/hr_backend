import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AbsenceService } from './absence.service';
import { AbsenceController } from './absence.controller';
import { Absence } from './entities/absence.entity';
import { EmployeesModule } from 'src/employees/employees.module';
import { EmployeeScheduleModule } from 'src/employee_schedule/employee_schedule.module';
import { ScheduleEvent } from 'src/schedule_event/entities/schedule_event.entity';
import { EmployeeSchedule } from 'src/employee_schedule/entities/employee_schedule.entity';

@Module({
    imports: [
        TypeOrmModule.forFeature([Absence, ScheduleEvent, EmployeeSchedule]),
        EmployeesModule,
        EmployeeScheduleModule,
    ],
    controllers: [AbsenceController],
    providers: [AbsenceService],
    exports: [AbsenceService],
})
export class AbsenceModule { }

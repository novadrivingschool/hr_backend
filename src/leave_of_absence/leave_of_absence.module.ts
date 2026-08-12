import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LeaveOfAbsenceService } from './leave_of_absence.service';
import { LeaveOfAbsenceController } from './leave_of_absence.controller';
import { LeaveOfAbsence } from './entities/leave-of-absence.entity';
import { EmployeesV2Module } from '../employees/employees-v2.module';

@Module({
    imports: [TypeOrmModule.forFeature([LeaveOfAbsence]), EmployeesV2Module],
    controllers: [LeaveOfAbsenceController],
    providers: [LeaveOfAbsenceService],
    exports: [LeaveOfAbsenceService],
})
export class LeaveOfAbsenceModule { }

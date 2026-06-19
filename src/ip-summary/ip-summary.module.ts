import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { InstructorPayroll } from '../instructor-payroll/entities/instructor-payroll.entity'
import { TeacherPayroll } from '../teacher-payroll/entities/teacher-payroll.entity'
import { AssignmentPayroll } from '../assignment-payroll/entities/assignment-payroll.entity'
import { NoShowPayroll } from '../no-show-payroll/entities/no-show-payroll.entity'
import { AssignmentRateType } from '../assignment-rate-types/entities/assignment-rate-type.entity'
import { IpSummaryService } from './ip-summary.service'
import { IpSummaryController } from './ip-summary.controller'

@Module({
  imports: [
    TypeOrmModule.forFeature([
      InstructorPayroll,
      TeacherPayroll,
      AssignmentPayroll,
      NoShowPayroll,
      AssignmentRateType,
    ]),
  ],
  controllers: [IpSummaryController],
  providers: [IpSummaryService],
})
export class IpSummaryModule {}

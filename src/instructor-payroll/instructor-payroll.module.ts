import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { InstructorPayroll } from './entities/instructor-payroll.entity'
import { InstructorPayrollService } from './instructor-payroll.service'
import { InstructorPayrollController } from './instructor-payroll.controller'
import { DanubenetHistoryModule } from '../danubenet-history/danubenet-history.module'

@Module({
  imports: [TypeOrmModule.forFeature([InstructorPayroll]), DanubenetHistoryModule],
  controllers: [InstructorPayrollController],
  providers: [InstructorPayrollService],
})
export class InstructorPayrollModule {}

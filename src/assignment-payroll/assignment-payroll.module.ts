import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { MulterModule } from '@nestjs/platform-express'
import { AssignmentPayroll } from './entities/assignment-payroll.entity'
import { AssignmentPayrollService } from './assignment-payroll.service'
import { AssignmentPayrollController } from './assignment-payroll.controller'

@Module({
  imports: [
    TypeOrmModule.forFeature([AssignmentPayroll]),
    MulterModule.register({ limits: { fileSize: 20 * 1024 * 1024 } }),
  ],
  controllers: [AssignmentPayrollController],
  providers: [AssignmentPayrollService],
})
export class AssignmentPayrollModule {}

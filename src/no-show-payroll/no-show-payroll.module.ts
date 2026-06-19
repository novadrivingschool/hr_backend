import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { MulterModule } from '@nestjs/platform-express'
import { NoShowPayroll } from './entities/no-show-payroll.entity'
import { NoShowPayrollService } from './no-show-payroll.service'
import { NoShowPayrollController } from './no-show-payroll.controller'

@Module({
  imports: [
    TypeOrmModule.forFeature([NoShowPayroll]),
    MulterModule.register({ limits: { fileSize: 20 * 1024 * 1024 } }),
  ],
  controllers: [NoShowPayrollController],
  providers: [NoShowPayrollService],
})
export class NoShowPayrollModule {}

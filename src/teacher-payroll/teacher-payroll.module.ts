import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { MulterModule } from '@nestjs/platform-express'
import { TeacherPayroll } from './entities/teacher-payroll.entity'
import { TeacherPayrollService } from './teacher-payroll.service'
import { TeacherPayrollController } from './teacher-payroll.controller'

@Module({
  imports: [
    TypeOrmModule.forFeature([TeacherPayroll]),
    MulterModule.register({ limits: { fileSize: 20 * 1024 * 1024 } }),
  ],
  controllers: [TeacherPayrollController],
  providers: [TeacherPayrollService],
})
export class TeacherPayrollModule {}

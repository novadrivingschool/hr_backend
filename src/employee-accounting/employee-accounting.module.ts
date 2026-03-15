import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EmployeeAccountingService } from './employee-accounting.service';
import { EmployeeAccountingController } from './employee-accounting.controller';
import { EmployeeAccounting } from './entities/employee-accounting.entity';
import { Employee } from '../employees/entities/employee.entity';

@Module({
  imports: [TypeOrmModule.forFeature([EmployeeAccounting, Employee])],
  controllers: [EmployeeAccountingController],
  providers: [EmployeeAccountingService],
  exports: [EmployeeAccountingService],
})
export class EmployeeAccountingModule {}
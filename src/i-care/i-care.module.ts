import { Module } from '@nestjs/common';
import { ICareService } from './i-care.service';
import { ICareController } from './i-care.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ICare } from './entities/i-care.entity';
import { Employee } from 'src/employees/entities/employee.entity';
import { ICareReason } from 'src/i_care_reasons/entities/i_care_reason.entity';
import { EmployeesV2Module } from '../employees/employees-v2.module';

@Module({
  controllers: [ICareController],
  providers: [ICareService],
  imports: [TypeOrmModule.forFeature([ICare, Employee, ICareReason]), EmployeesV2Module],
})
export class ICareModule {}

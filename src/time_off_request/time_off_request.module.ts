import { Module } from '@nestjs/common';
import { TimeOffRequestService } from './time_off_request.service';
import { TimeOffRequestController } from './time_off_request.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TimeOffRequest } from './entities/time_off_request.entity';
import { EmployeesModule } from 'src/employees/employees.module';

@Module({
  imports: [TypeOrmModule.forFeature([TimeOffRequest]), EmployeesModule],
  controllers: [TimeOffRequestController],
  providers: [TimeOffRequestService],
  exports: [TimeOffRequestService],
})
export class TimeOffRequestModule { }

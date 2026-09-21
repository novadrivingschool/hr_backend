import { Module } from '@nestjs/common';
import { ActivityRequestService } from './activity_request.service';
import { ActivityRequestController } from './activity_request.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ActivityRequest } from './entities/activity_request.entity';
import { EmployeesModule } from 'src/employees/employees.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ActivityRequest]),
    EmployeesModule,
  ],
  controllers: [ActivityRequestController],
  providers: [ActivityRequestService],
  exports: [ActivityRequestService],
})
export class ActivityRequestModule { }

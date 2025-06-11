import { Module } from '@nestjs/common';
import { TimeOffRequestService } from './time_off_request.service';
import { TimeOffRequestController } from './time_off_request.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TimeOffRequest } from './entities/time_off_request.entity';

@Module({
  imports: [TypeOrmModule.forFeature([TimeOffRequest])],
  controllers: [TimeOffRequestController],
  providers: [TimeOffRequestService],
  exports: [TimeOffRequestService],
})
export class TimeOffRequestModule { }

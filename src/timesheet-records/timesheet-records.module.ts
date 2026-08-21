import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MulterModule } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { TimesheetRecord } from './entities/timesheet-record.entity';
import { TimesheetRecordsController } from './timesheet-records.controller';
import { TimesheetRecordsService } from './timesheet-records.service';
import { PayrollModule } from 'src/payroll/payroll.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([TimesheetRecord]),
    MulterModule.register({
      storage: memoryStorage(),
    }),
    PayrollModule,
  ],
  controllers: [TimesheetRecordsController],
  providers: [TimesheetRecordsService],
  exports: [TimesheetRecordsService],
})
export class TimesheetRecordsModule {}

import { Module } from '@nestjs/common';
import { HolidaysService } from './holidays.service';
import { HolidaysController } from './holidays.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Holiday } from './entities/holiday.entity';
import { HolidayAuditLog } from './entities/holiday-audit-log.entity';

@Module({
  controllers: [HolidaysController],
  providers: [HolidaysService],
  imports: [TypeOrmModule.forFeature([Holiday, HolidayAuditLog])],
})
export class HolidaysModule { }

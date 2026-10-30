import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DanubenetHistory } from './entities/danubenet-history.entity';
import { DanubenetHistoryService } from './danubenet-history.service';
import { DanubenetHistoryController } from './danubenet-history.controller';
import { VoutDirectoryService } from './vout-directory.service';
import { EmployeesModule } from '../employees/employees.module';

@Module({
  imports: [TypeOrmModule.forFeature([DanubenetHistory]), EmployeesModule],
  controllers: [DanubenetHistoryController],
  providers: [DanubenetHistoryService, VoutDirectoryService],
  exports: [DanubenetHistoryService],
})
export class DanubenetHistoryModule {}

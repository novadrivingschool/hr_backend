import { Module } from '@nestjs/common';
import { MaritalStatusService } from './marital_status.service';
import { MaritalStatusController } from './marital_status.controller';
import { MaritalStatus } from './entities/marital_status.entity';
import { TypeOrmModule } from '@nestjs/typeorm';

@Module({
  controllers: [MaritalStatusController],
  providers: [MaritalStatusService],
  imports: [TypeOrmModule.forFeature([MaritalStatus])],
})
export class MaritalStatusModule { }

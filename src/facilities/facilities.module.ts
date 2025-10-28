import { Module } from '@nestjs/common';
import { FacilitiesService } from './facilities.service';
import { FacilitiesController } from './facilities.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Facility } from './entities/facility.entity';

@Module({
  controllers: [FacilitiesController],
  providers: [FacilitiesService],
  imports: [TypeOrmModule.forFeature([Facility])],
})
export class FacilitiesModule {}

import { Module } from '@nestjs/common';
import { OfficeSuppliesService } from './office_supplies.service';
import { OfficeSuppliesController } from './office_supplies.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OfficeSupply } from './entities/office_supply.entity';

@Module({
  controllers: [OfficeSuppliesController],
  providers: [OfficeSuppliesService],
  imports: [TypeOrmModule.forFeature([OfficeSupply])],
})
export class OfficeSuppliesModule {}

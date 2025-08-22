import { Module } from '@nestjs/common';
import { EthnicityService } from './ethnicity.service';
import { EthnicityController } from './ethnicity.controller';
import { Ethnicity } from './entities/ethnicity.entity';
import { TypeOrmModule } from '@nestjs/typeorm';

@Module({
  controllers: [EthnicityController],
  providers: [EthnicityService],
  imports: [TypeOrmModule.forFeature([Ethnicity])],
})
export class EthnicityModule { }

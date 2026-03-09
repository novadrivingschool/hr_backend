import { Module } from '@nestjs/common';
import { ICareReasonsService } from './i_care_reasons.service';
import { ICareReasonsController } from './i_care_reasons.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ICareReason } from './entities/i_care_reason.entity';

@Module({
  controllers: [ICareReasonsController],
  providers: [ICareReasonsService],
  imports: [TypeOrmModule.forFeature([ICareReason])],
})
export class ICareReasonsModule {}

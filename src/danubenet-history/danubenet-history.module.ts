import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DanubenetHistory } from './entities/danubenet-history.entity';
import { DanubenetHistoryService } from './danubenet-history.service';
import { DanubenetHistoryController } from './danubenet-history.controller';

@Module({
  imports: [TypeOrmModule.forFeature([DanubenetHistory])],
  controllers: [DanubenetHistoryController],
  providers: [DanubenetHistoryService],
  exports: [DanubenetHistoryService],
})
export class DanubenetHistoryModule {}

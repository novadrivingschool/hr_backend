import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DanubenetHistory } from './entities/danubenet-history.entity';
import { DanubenetHistoryService } from './danubenet-history.service';

@Module({
  imports: [TypeOrmModule.forFeature([DanubenetHistory])],
  providers: [DanubenetHistoryService],
  exports: [DanubenetHistoryService],
})
export class DanubenetHistoryModule {}

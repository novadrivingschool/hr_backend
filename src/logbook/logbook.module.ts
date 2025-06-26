import { Module } from '@nestjs/common';
import { LogbookService } from './logbook.service';
import { LogbookController } from './logbook.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Logbook } from './entities/logbook.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Logbook])],
  controllers: [LogbookController],
  providers: [LogbookService],
  exports: [LogbookService],
})
export class LogbookModule {}

import { Module } from '@nestjs/common';
import { RaceService } from './race.service';
import { RaceController } from './race.controller';
import { Race } from './entities/race.entity';
import { TypeOrmModule } from '@nestjs/typeorm';

@Module({
  controllers: [RaceController],
  providers: [RaceService],
  imports: [TypeOrmModule.forFeature([Race])],

})
export class RaceModule { }

import { Module } from '@nestjs/common';
import { PositionService } from './position.service';
import { PositionController } from './position.controller';
import { Position } from './entities/position.entity';
import { TypeOrmModule } from '@nestjs/typeorm';

@Module({
  controllers: [PositionController],
  providers: [PositionService],
  imports: [TypeOrmModule.forFeature([Position])],
})
export class PositionModule { }

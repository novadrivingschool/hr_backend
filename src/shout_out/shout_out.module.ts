import { Module } from '@nestjs/common';
import { ShoutOutService } from './shout_out.service';
import { ShoutOutController } from './shout_out.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ShoutOut } from './entities/shout_out.entity';

@Module({
  controllers: [ShoutOutController],
  providers: [ShoutOutService],
  imports:[TypeOrmModule.forFeature([ShoutOut])]
})
export class ShoutOutModule {}

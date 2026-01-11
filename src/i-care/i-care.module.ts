import { Module } from '@nestjs/common';
import { ICareService } from './i-care.service';
import { ICareController } from './i-care.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ICare } from './entities/i-care.entity';

@Module({
  controllers: [ICareController],
  providers: [ICareService],
  imports: [TypeOrmModule.forFeature([ICare])],
})
export class ICareModule {}

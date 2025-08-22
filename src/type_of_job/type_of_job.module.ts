import { Module } from '@nestjs/common';
import { TypeOfJobService } from './type_of_job.service';
import { TypeOfJobController } from './type_of_job.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TypeOfJob } from './entities/type_of_job.entity';

@Module({
  controllers: [TypeOfJobController],
  providers: [TypeOfJobService],
  imports: [TypeOrmModule.forFeature([TypeOfJob])],
})
export class TypeOfJobModule {}

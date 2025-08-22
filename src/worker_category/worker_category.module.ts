import { Module } from '@nestjs/common';
import { WorkerCategoryService } from './worker_category.service';
import { WorkerCategoryController } from './worker_category.controller';
import { WorkerCategory } from './entities/worker_category.entity';
import { TypeOrmModule } from '@nestjs/typeorm';

@Module({
  controllers: [WorkerCategoryController],
  providers: [WorkerCategoryService],
  imports: [TypeOrmModule.forFeature([WorkerCategory])],
})
export class WorkerCategoryModule {}

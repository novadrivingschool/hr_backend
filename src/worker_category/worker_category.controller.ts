import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { WorkerCategoryService } from './worker_category.service';
import { CreateWorkerCategoryDto } from './dto/create-worker_category.dto';
import { UpdateWorkerCategoryDto } from './dto/update-worker_category.dto';

@Controller('worker-category')
export class WorkerCategoryController {
  constructor(private readonly workerCategoryService: WorkerCategoryService) {}

  @Post()
  create(@Body() createWorkerCategoryDto: CreateWorkerCategoryDto) {
    return this.workerCategoryService.create(createWorkerCategoryDto);
  }

  @Get()
  findAll() {
    return this.workerCategoryService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.workerCategoryService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateWorkerCategoryDto: UpdateWorkerCategoryDto) {
    return this.workerCategoryService.update(id, updateWorkerCategoryDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.workerCategoryService.remove(id);
  }
}

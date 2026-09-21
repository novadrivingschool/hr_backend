import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { UseGuards } from '@nestjs/common';
import { HrJwtGuard } from '../common/guards/hr-jwt.guard';
import { PermissionGuard, RequirePermission } from '../common/guards/permission.guard';
import { WorkerCategoryService } from './worker_category.service';
import { CreateWorkerCategoryDto } from './dto/create-worker_category.dto';
import { UpdateWorkerCategoryDto } from './dto/update-worker_category.dto';

@Controller('worker-category')
export class WorkerCategoryController {
  constructor(private readonly workerCategoryService: WorkerCategoryService) {}

  @UseGuards(HrJwtGuard, PermissionGuard)
  @RequirePermission('it_hr_catalogs')
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

  @UseGuards(HrJwtGuard, PermissionGuard)
  @RequirePermission('it_hr_catalogs')
  @Patch(':id')
  update(@Param('id') id: string, @Body() updateWorkerCategoryDto: UpdateWorkerCategoryDto) {
    return this.workerCategoryService.update(id, updateWorkerCategoryDto);
  }

  @UseGuards(HrJwtGuard, PermissionGuard)
  @RequirePermission('it_hr_catalogs')
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.workerCategoryService.remove(id);
  }
}

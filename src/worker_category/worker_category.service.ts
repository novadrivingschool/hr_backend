// src/worker_category/worker_category.service.ts
import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WorkerCategory } from './entities/worker_category.entity';
import { CreateWorkerCategoryDto } from './dto/create-worker_category.dto';
import { UpdateWorkerCategoryDto } from './dto/update-worker_category.dto';

@Injectable()
export class WorkerCategoryService {
  constructor(
    @InjectRepository(WorkerCategory)
    private readonly repo: Repository<WorkerCategory>,
  ) {}

  async create(dto: CreateWorkerCategoryDto): Promise<WorkerCategory> {
    // Evitar duplicados
    const exists = await this.repo.findOne({ where: { name: dto.name } });
    if (exists) {
      throw new ConflictException(
        `WorkerCategory "${dto.name}" already exists`,
      );
    }
    const entity = this.repo.create(dto);
    return this.repo.save(entity);
  }

  async findAll(): Promise<WorkerCategory[]> {
    return this.repo.find();
  }

  async findOne(id: string): Promise<WorkerCategory> {
    const entity = await this.repo.findOne({ where: { id } });
    if (!entity) {
      throw new NotFoundException(
        `WorkerCategory with id "${id}" not found`,
      );
    }
    return entity;
  }

  async update(
    id: string,
    dto: UpdateWorkerCategoryDto,
  ): Promise<WorkerCategory> {
    const entity = await this.findOne(id);

    if (dto.name && dto.name !== entity.name) {
      const dup = await this.repo.findOne({ where: { name: dto.name } });
      if (dup) {
        throw new ConflictException(
          `WorkerCategory "${dto.name}" already exists`,
        );
      }
    }

    Object.assign(entity, dto);
    return this.repo.save(entity);
  }

  async remove(id: string): Promise<{ id: string; deleted: boolean }> {
    const entity = await this.findOne(id);
    await this.repo.remove(entity);
    return { id, deleted: true };
  }
}

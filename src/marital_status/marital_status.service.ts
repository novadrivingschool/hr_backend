// src/marital_status/marital_status.service.ts
import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MaritalStatus } from './entities/marital_status.entity';
import { CreateMaritalStatusDto } from './dto/create-marital_status.dto';
import { UpdateMaritalStatusDto } from './dto/update-marital_status.dto';

@Injectable()
export class MaritalStatusService {
  constructor(
    @InjectRepository(MaritalStatus)
    private readonly repo: Repository<MaritalStatus>,
  ) {}

  async create(dto: CreateMaritalStatusDto): Promise<MaritalStatus> {
    const exists = await this.repo.findOne({ where: { name: dto.name } });
    if (exists) {
      throw new ConflictException(
        `MaritalStatus "${dto.name}" already exists`,
      );
    }
    const entity = this.repo.create(dto);
    return this.repo.save(entity);
  }

  async findAll(): Promise<MaritalStatus[]> {
    return this.repo.find();
  }

  async findOne(id: string): Promise<MaritalStatus> {
    const entity = await this.repo.findOne({ where: { id } });
    if (!entity) {
      throw new NotFoundException(
        `MaritalStatus with id "${id}" not found`,
      );
    }
    return entity;
  }

  async update(
    id: string,
    dto: UpdateMaritalStatusDto,
  ): Promise<MaritalStatus> {
    const entity = await this.findOne(id);

    if (dto.name && dto.name !== entity.name) {
      const dup = await this.repo.findOne({ where: { name: dto.name } });
      if (dup) {
        throw new ConflictException(
          `MaritalStatus "${dto.name}" already exists`,
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

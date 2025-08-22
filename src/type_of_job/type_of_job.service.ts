import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { TypeOfJob } from './entities/type_of_job.entity';
import { CreateTypeOfJobDto } from './dto/create-type_of_job.dto';
import { UpdateTypeOfJobDto } from './dto/update-type_of_job.dto';

@Injectable()
export class TypeOfJobService {
  constructor(
    @InjectRepository(TypeOfJob)
    private readonly repo: Repository<TypeOfJob>,
  ) {}

  async create(createTypeOfJobDto: CreateTypeOfJobDto): Promise<TypeOfJob> {
    const entity = this.repo.create(createTypeOfJobDto);
    return this.repo.save(entity);
  }

  async findAll(): Promise<TypeOfJob[]> {
    return this.repo.find({
      order: { id: 'ASC' }, // ajusta si prefieres ordenar por otro campo
    });
  }

  async findOne(id: string): Promise<TypeOfJob> {
    const found = await this.repo.findOne({ where: { id } });
    if (!found) {
      throw new NotFoundException(`TypeOfJob #${id} not found`);
    }
    return found;
  }

  async update(id: string, updateTypeOfJobDto: UpdateTypeOfJobDto): Promise<TypeOfJob> {
    const entity = await this.findOne(id);
    Object.assign(entity, updateTypeOfJobDto);
    return this.repo.save(entity);
  }

  async remove(id: string): Promise<{ deleted: true }> {
    const entity = await this.findOne(id);
    await this.repo.remove(entity);
    return { deleted: true };
  }
}

import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { CandidateTrackerPosition } from './entities/candidate-tracker-position.entity';
import { CreateCandidateTrackerPositionDto } from './dto/create-candidate-tracker-position.dto';
import { UpdateCandidateTrackerPositionDto } from './dto/update-candidate-tracker-position.dto';

@Injectable()
export class CandidateTrackerPositionsService {
  constructor(
    @InjectRepository(CandidateTrackerPosition)
    private readonly repo: Repository<CandidateTrackerPosition>,
  ) {}

  async create(dto: CreateCandidateTrackerPositionDto): Promise<CandidateTrackerPosition> {
    const exists = await this.repo.findOne({ where: { name: dto.name } });
    if (exists) {
      throw new ConflictException(`Position "${dto.name}" already exists`);
    }

    const entity = this.repo.create(dto);
    return this.repo.save(entity);
  }

  async findAll(): Promise<CandidateTrackerPosition[]> {
    return this.repo.find({ order: { name: 'ASC' } });
  }

  async findOne(id: string): Promise<CandidateTrackerPosition> {
    const entity = await this.repo.findOne({ where: { id } });
    if (!entity) {
      throw new NotFoundException(`Position with id "${id}" not found`);
    }
    return entity;
  }

  async update(
    id: string,
    dto: UpdateCandidateTrackerPositionDto,
  ): Promise<CandidateTrackerPosition> {
    const entity = await this.findOne(id);

    if (dto.name && dto.name !== entity.name) {
      const dup = await this.repo.findOne({ where: { name: dto.name } });
      if (dup) {
        throw new ConflictException(`Position "${dto.name}" already exists`);
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

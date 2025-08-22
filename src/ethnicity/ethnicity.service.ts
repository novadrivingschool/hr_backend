import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Ethnicity } from './entities/ethnicity.entity';
import { CreateEthnicityDto } from './dto/create-ethnicity.dto';
import { UpdateEthnicityDto } from './dto/update-ethnicity.dto';

@Injectable()
export class EthnicityService {
  constructor(
    @InjectRepository(Ethnicity)
    private readonly repo: Repository<Ethnicity>,
  ) { }

  async create(dto: CreateEthnicityDto): Promise<Ethnicity> {
    const exists = await this.repo.findOne({ where: { name: dto.name } });
    if (exists) {
      throw new ConflictException(`Ethnicity "${dto.name}" already exists`);
    }
    const entity = this.repo.create(dto);
    return this.repo.save(entity);
  }

  async findAll(): Promise<Ethnicity[]> {
    return this.repo.find();
  }

  async findOne(id: string): Promise<Ethnicity> {
    const entity = await this.repo.findOne({ where: { id } });
    if (!entity) {
      throw new NotFoundException(`Ethnicity with id "${id}" not found`);
    }
    return entity;
  }

  async update(id: string, dto: UpdateEthnicityDto): Promise<Ethnicity> {
    const entity = await this.findOne(id);

    if (dto.name && dto.name !== entity.name) {
      const dup = await this.repo.findOne({ where: { name: dto.name } });
      if (dup) {
        throw new ConflictException(`Ethnicity "${dto.name}" already exists`);
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

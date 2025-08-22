import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Gender } from './entities/gender.entity';
import { CreateGenderDto } from './dto/create-gender.dto';
import { UpdateGenderDto } from './dto/update-gender.dto';

@Injectable()
export class GenderService {
  constructor(
    @InjectRepository(Gender)
    private readonly repo: Repository<Gender>,
  ) { }

  async create(dto: CreateGenderDto): Promise<Gender> {
    const exists = await this.repo.findOne({ where: { name: dto.name } });
    if (exists) {
      throw new ConflictException(`Gender "${dto.name}" already exists`);
    }
    const entity = this.repo.create(dto);
    return this.repo.save(entity);
  }

  async findAll(): Promise<Gender[]> {
    return this.repo.find();
  }

  async findOne(id: string): Promise<Gender> {
    const entity = await this.repo.findOne({ where: { id } });
    if (!entity) {
      throw new NotFoundException(`Gender with id "${id}" not found`);
    }
    return entity;
  }

  async update(id: string, dto: UpdateGenderDto): Promise<Gender> {
    const entity = await this.findOne(id);

    if (dto.name && dto.name !== entity.name) {
      const dup = await this.repo.findOne({ where: { name: dto.name } });
      if (dup) {
        throw new ConflictException(`Gender "${dto.name}" already exists`);
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

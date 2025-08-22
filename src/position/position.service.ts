import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Position } from './entities/position.entity';
import { CreatePositionDto } from './dto/create-position.dto';
import { UpdatePositionDto } from './dto/update-position.dto';

@Injectable()
export class PositionService {
  constructor(
    @InjectRepository(Position)
    private readonly repo: Repository<Position>,
  ) { }

  async create(dto: CreatePositionDto): Promise<Position> {
    // Verificar duplicado
    const exists = await this.repo.findOne({ where: { name: dto.name } });
    if (exists) {
      throw new ConflictException(`Position "${dto.name}" already exists`);
    }

    const entity = this.repo.create(dto);
    return this.repo.save(entity);
  }

  async findAll(): Promise<Position[]> {
    return this.repo.find();
  }

  async findOne(id: string): Promise<Position> {
    const entity = await this.repo.findOne({ where: { id } });
    if (!entity) {
      throw new NotFoundException(`Position with id "${id}" not found`);
    }
    return entity;
  }

  async update(id: string, dto: UpdatePositionDto): Promise<Position> {
    const entity = await this.findOne(id);

    // Validar duplicado si se cambia el nombre
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

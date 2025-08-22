import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Race } from './entities/race.entity';
import { CreateRaceDto } from './dto/create-race.dto';
import { UpdateRaceDto } from './dto/update-race.dto';

@Injectable()
export class RaceService {
  constructor(
    @InjectRepository(Race)
    private readonly repo: Repository<Race>,
  ) { }

  async create(createRaceDto: CreateRaceDto): Promise<Race> {
    const entity = this.repo.create(createRaceDto);
    return this.repo.save(entity);
  }

  async findAll(): Promise<Race[]> {
    return this.repo.find({
      order: { id: 'ASC' },
    });
  }

  async findOne(id: string): Promise<Race> {
    const found = await this.repo.findOne({ where: { id } });
    if (!found) {
      throw new NotFoundException(`Race #${id} not found`);
    }
    return found;
  }

  async update(id: string, updateRaceDto: UpdateRaceDto): Promise<Race> {
    const entity = await this.findOne(id);
    Object.assign(entity, updateRaceDto);
    return this.repo.save(entity);
  }

  async remove(id: string): Promise<{ deleted: true }> {
    const entity = await this.findOne(id);
    await this.repo.remove(entity);
    return { deleted: true };
  }
}

import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TypeOfSchedule } from './entities/type_of_schedule.entity';
import { CreateTypeOfScheduleDto } from './dto/create-type_of_schedule.dto';
import { UpdateTypeOfScheduleDto } from './dto/update-type_of_schedule.dto';

@Injectable()
export class TypeOfScheduleService {
  constructor(
    @InjectRepository(TypeOfSchedule)
    private readonly repo: Repository<TypeOfSchedule>,
  ) { }

  async create(dto: CreateTypeOfScheduleDto): Promise<TypeOfSchedule> {
    // Evita duplicados por unique name (manejo amigable de error)
    const exists = await this.repo.findOne({ where: { name: dto.name } });
    if (exists) {
      throw new ConflictException(`TypeOfSchedule "${dto.name}" already exists`);
    }
    const entity = this.repo.create(dto);
    return this.repo.save(entity);
  }

  async findAll(): Promise<TypeOfSchedule[]> {
    return this.repo.find();
  }

  async findOne(id: string): Promise<TypeOfSchedule> {
    const entity = await this.repo.findOne({ where: { id } });
    if (!entity) {
      throw new NotFoundException(`TypeOfSchedule with id "${id}" not found`);
    }
    return entity;
  }

  async update(
    id: string,
    dto: UpdateTypeOfScheduleDto,
  ): Promise<TypeOfSchedule> {
    const entity = await this.findOne(id);

    // Si actualiza name, verifica duplicado
    if (dto.name && dto.name !== entity.name) {
      const dup = await this.repo.findOne({ where: { name: dto.name } });
      if (dup) {
        throw new ConflictException(
          `TypeOfSchedule "${dto.name}" already exists`,
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

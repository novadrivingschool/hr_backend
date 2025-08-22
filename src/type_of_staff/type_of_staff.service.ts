import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { TypeOfStaff } from './entities/type_of_staff.entity';
import { CreateTypeOfStaffDto } from './dto/create-type_of_staff.dto';
import { UpdateTypeOfStaffDto } from './dto/update-type_of_staff.dto';

@Injectable()
export class TypeOfStaffService {
  constructor(
    @InjectRepository(TypeOfStaff)
    private readonly repo: Repository<TypeOfStaff>,
  ) { }

  async create(createDto: CreateTypeOfStaffDto): Promise<TypeOfStaff> {
    const entity = this.repo.create(createDto);
    return this.repo.save(entity);
  }

  async findAll(): Promise<TypeOfStaff[]> {
    return this.repo.find({ order: { id: 'ASC' } });
  }

  async findOne(id: string): Promise<TypeOfStaff> {
    const found = await this.repo.findOne({ where: { id } });
    if (!found) throw new NotFoundException(`TypeOfStaff #${id} not found`);
    return found;
  }

  async update(id: string, updateDto: UpdateTypeOfStaffDto): Promise<TypeOfStaff> {
    const entity = await this.findOne(id);
    Object.assign(entity, updateDto);
    return this.repo.save(entity);
  }

  async remove(id: string): Promise<{ deleted: true }> {
    const entity = await this.findOne(id);
    await this.repo.remove(entity);
    return { deleted: true };
  }
}

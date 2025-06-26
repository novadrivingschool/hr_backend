import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateDepartmentDto } from './dto/create-department.dto';
import { UpdateDepartmentDto } from './dto/update-department.dto';
import { Department } from './entities/department.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

@Injectable()
export class DepartmentsService {
  constructor(
    @InjectRepository(Department)
    private readonly departmentRepo: Repository<Department>,
  ) { }

  async create(dto: CreateDepartmentDto): Promise<Department> {
    const department = this.departmentRepo.create(dto);
    return await this.departmentRepo.save(department);
  }

  async findAll(): Promise<Department[]> {
    return await this.departmentRepo.find();
  }

  async findOne(id: string): Promise<Department> {
    const department = await this.departmentRepo.findOneBy({ id });
    if (!department) throw new NotFoundException(`Department with id ${id} not found`);
    return department;
  }

  async update(id: string, dto: UpdateDepartmentDto): Promise<Department> {
    const department = await this.findOne(id);
    const updated = this.departmentRepo.merge(department, dto);
    return await this.departmentRepo.save(updated);
  }

  async remove(id: string): Promise<void> {
    const result = await this.departmentRepo.delete(id);
    if (result.affected === 0) {
      throw new NotFoundException(`Department with id ${id} not found`);
    }
  }
}

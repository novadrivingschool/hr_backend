import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { CreateEmployeeAccountingDto } from './dto/create-employee-accounting.dto';
import { UpdateEmployeeAccountingDto } from './dto/update-employee-accounting.dto';
import { EmployeeAccounting } from './entities/employee-accounting.entity';
import { Employee } from '../employees/entities/employee.entity';

@Injectable()
export class EmployeeAccountingService {
  constructor(
    @InjectRepository(EmployeeAccounting)
    private readonly employeeAccountingRepository: Repository<EmployeeAccounting>,

    @InjectRepository(Employee)
    private readonly employeeRepository: Repository<Employee>,
  ) {}

  async create(createEmployeeAccountingDto: CreateEmployeeAccountingDto) {
    const employee = await this.employeeRepository.findOne({
      where: { employee_number: createEmployeeAccountingDto.employee_number },
    });

    if (!employee) {
      throw new NotFoundException(
        `Employee with employee_number ${createEmployeeAccountingDto.employee_number} was not found`,
      );
    }

    const existingAccounting = await this.employeeAccountingRepository.findOne({
      where: { employee_number: createEmployeeAccountingDto.employee_number },
    });

    if (existingAccounting) {
      throw new ConflictException(
        `EmployeeAccounting already exists for employee_number ${createEmployeeAccountingDto.employee_number}`,
      );
    }

    const employeeAccounting = this.employeeAccountingRepository.create({
      ...createEmployeeAccountingDto,
      employee,
    });

    return await this.employeeAccountingRepository.save(employeeAccounting);
  }

  async findAll() {
    return await this.employeeAccountingRepository.find({
      relations: ['employee'],
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string) {
    const employeeAccounting = await this.employeeAccountingRepository.findOne({
      where: { id },
      relations: ['employee'],
    });

    if (!employeeAccounting) {
      throw new NotFoundException(
        `EmployeeAccounting with id ${id} was not found`,
      );
    }

    return employeeAccounting;
  }

  async findByEmployeeNumber(employee_number: string) {
    const employeeAccounting = await this.employeeAccountingRepository.findOne({
      where: { employee_number },
      relations: ['employee'],
    });

    if (!employeeAccounting) {
      throw new NotFoundException(
        `EmployeeAccounting for employee_number ${employee_number} was not found`,
      );
    }

    return employeeAccounting;
  }

  async update(id: string, updateEmployeeAccountingDto: UpdateEmployeeAccountingDto) {
    const employeeAccounting = await this.findOne(id);

    Object.assign(employeeAccounting, updateEmployeeAccountingDto);

    return await this.employeeAccountingRepository.save(employeeAccounting);
  }

  async remove(id: string) {
    const employeeAccounting = await this.findOne(id);

    await this.employeeAccountingRepository.remove(employeeAccounting);

    return {
      message: `EmployeeAccounting with id ${id} was removed successfully`,
    };
  }
}
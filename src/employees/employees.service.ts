import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Employee } from './entities/employee.entity';

@Injectable()
export class EmployeesService {
  constructor(
    @InjectRepository(Employee)
    private readonly employeeRepo: Repository<Employee>,
  ) { }

  async findAll(): Promise<Employee[]> {
    return this.employeeRepo.find({
      where: { status: 'Active' },
      select: ['name', 'last_name', 'employee_number', 'department', 'company', 'country', 'location'],
    });
  }

  /* async findByDepartment(department: string): Promise<Employee[]> {
    return this.employeeRepo.find({
      where: {
        status: 'Active',
        department,
      },
      select: ['name', 'last_name', 'employee_number', 'department'],
    });
  } */
  async findByDepartment(department: string): Promise<Employee[]> {
    const where: any = { status: 'Active' };

    if (department !== 'all') {
      where.department = department;
    }

    return this.employeeRepo.find({
      where,
      select: ['name', 'last_name', 'employee_number', 'department'],
    });
  }


}

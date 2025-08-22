import { Controller, Get, Post, Body, Patch, Param, Delete, Query, NotFoundException, BadRequestException } from '@nestjs/common';
import { EmployeesService } from './employees.service';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';

@Controller('employees')
export class EmployeesController {
  constructor(private readonly employeesService: EmployeesService) { }

  @Get()
  findAll() {
    return this.employeesService.findAll();
  }

  @Get('department/:department')
  findByDepartment(@Param('department') department: string) {
    return this.employeesService.findByDepartment(department);
  }

  @Get('search')
  async searchByFullName(@Query('fullName') fullName: string) {
    if (!fullName || !fullName.trim()) {
      throw new BadRequestException('fullName es requerido');
    }

    const result = await this.employeesService.findByFullNameStrict(fullName.trim());

    return result || null; // si no existe devuelve null
  }


}

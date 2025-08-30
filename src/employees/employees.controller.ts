import { Controller, Get, Post, Body, Patch, Param, Delete, Query, NotFoundException, BadRequestException } from '@nestjs/common';
import { EmployeesService } from './employees.service';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { FindByRolesDto } from './dto/find-by-role.dto';
import { UpdateEquipmentStatusDto } from './dto/update-equipment-status.dto';

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

  // GET /employees/active-roles?departments=HR&departments=Accounting
  // GET /employees/active-roles?departments=HR,Accounting
  @Get('active-roles')
  async getActiveManagersAndCoordinators(@Query() query: FindByRolesDto) {
    console.log("get active managers and coordinators: ", query.departments);
    return this.employeesService.findActiveManagersAndCoordinators(query);
  }

  @Get('active-roles/emails')
  async findCoordinatorsEmailsByDepartments(@Query() query: FindByRolesDto) {
    return this.employeesService.findCoordinatorsEmailsByDepartments(query);
  }

  @Patch(':employeeNumber/equipment-status')
  async updateEquipmentStatusByEmployeeNumber(
    @Param('employeeNumber') employeeNumber: string,
    @Body() dto: UpdateEquipmentStatusDto,
  ) {
    return this.employeesService.updateEquipmentStatusByEmployeeNumber(
      employeeNumber,
      dto,
    );
  }
}

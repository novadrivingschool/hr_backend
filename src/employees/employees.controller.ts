import { Controller, Get, Post, Body, Patch, Param, Delete, Query, NotFoundException, BadRequestException, ParseArrayPipe } from '@nestjs/common';
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
    console.log("findAll employees")
    return this.employeesService.findAll();
  }

  /* @Get('department/:department')
  findByDepartment(@Param('department') department: string) {
    return this.employeesService.findByDepartment(department);
  } */
  // 👉 /employees/department?department=HR
  // 👉 /employees/department?department=HR,Sales
  // 👉 /employees/department?department=HR&department=Sales
  // 👉 /employees/department  (equivale a "all")
  @Get('department')
  findByDepartment(
    @Query(
      'department',
      new ParseArrayPipe({ items: String, separator: ',', optional: true })
    )
    departments?: string[],   // será undefined, o un array con 1+ valores
  ) {
    console.log("-------------- findByDepartment -------------")
    console.log("departments:", departments);
    return this.employeesService.findByDepartment(
      departments?.length ? departments : 'all'
    );
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

   // GET /employees/position?position=Coordinator
  // GET /employees/position?position=coor&exact=false
  @Get('position')
  async findActiveByPosition(
    @Query('position') position: string,
    @Query('exact') exact?: string, // "true" | "false" (opcional)
  ) {
    if (!position || !position.trim()) {
      throw new BadRequestException('Query param "position" is required');
    }
    const isExact = String(exact).toLowerCase() === 'true';
    return this.employeesService.findActiveByPosition(position.trim(), { exact: isExact });
  }

  // GET /employees/:employeeNumber/supervisors/emails  → string[]
  @Get(':employeeNumber/supervisors/emails')
  async getSupervisorsEmails(
    @Param('employeeNumber') employeeNumber: string,
  ): Promise<string[]> {
    const emails = await this.employeesService.getSupervisorsEmailsByEmployeeNumber(employeeNumber);
    if (!emails) throw new NotFoundException('Employee not found');
    return emails; // solo array de emails
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

import { Controller, Get, Post, Body, Patch, Param, Delete, Query, NotFoundException, BadRequestException, ParseArrayPipe, HttpCode, HttpStatus } from '@nestjs/common';
import { EmployeesService } from './employees.service';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { FindByRolesDto } from './dto/find-by-role.dto';
import { UpdateEquipmentStatusDto } from './dto/update-equipment-status.dto';
import { SearchEmployeeDto } from './dto/filter-employee.dto';
import { UpdateDanubanetDto } from './dto/update-danubanet.dto';
import { SearchByDanubanetDto } from './dto/search-by-danubanet.dto';

@Controller('employees')
export class EmployeesController {
  constructor(private readonly employeesService: EmployeesService) { }

  @Get()
  findAll() {
    console.log("findAll employees")
    return this.employeesService.findAll();
  }

  @Post('search')
  @HttpCode(HttpStatus.OK)
  async search(@Body() searchDto: SearchEmployeeDto) {
    return this.employeesService.filter(searchDto);
  }

  @Post('danubanet/search')
  @HttpCode(HttpStatus.OK)
  async searchByDanubanet(@Body() searchDto: SearchByDanubanetDto) {
    return this.employeesService.searchByDanubanet(searchDto.danubanet_names);
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

  @Get('position')
  async findActiveByPosition(
    @Query('position') position: string | string[],
  ) {
    if (!position) {
      throw new BadRequestException('Query param "position" is required');
    }

    // Si mandan '?position=Manager,Developer', lo separamos por comas.
    // Si mandan '?position=Manager&position=Developer', ya es un array.
    const positionsToPass = typeof position === 'string'
      ? position.split(',').map(p => p.trim())
      : position;

    // Llamamos al servicio pasando únicamente las posiciones
    return this.employeesService.findActiveByPosition(positionsToPass);
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

  @Patch(':employee_number')
  async updateEmployee(
    @Param('employee_number') employeeNumber: string,
    @Body() updateEmployeeDto: UpdateEmployeeDto,
  ) {
    console.log(`Actualizando empleado: ${employeeNumber}`, updateEmployeeDto);

    return this.employeesService.updateEmployeeByNumber(
      employeeNumber,
      updateEmployeeDto
    );
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

  @Patch(':employee_number/danubanet-name')
  async updateDanubanetName(
    @Param('employee_number') employeeNumber: string,
    @Body() updateDanubanetDto: UpdateDanubanetDto,
  ) {
    return this.employeesService.updateDanubanetName(
      employeeNumber,
      updateDanubanetDto.danubanet_name_1
    );
  }
}

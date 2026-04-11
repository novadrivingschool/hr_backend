import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  HttpCode,
  HttpStatus,
  Query,
  ParseArrayPipe,
  BadRequestException,
  Res
} from '@nestjs/common';
import { EmployeesV2Service } from './employees-v2.service';
import { CreateEmployeeDto } from '../employees/dto/create-employee.dto';
import { UpdateEmployeeDto } from '../employees/dto/update-employee.dto';
import { SearchEmployeeDto } from './dto/filter-employee.dto';
import { Response } from 'express';



@Controller('v2/employees')
export class EmployeesV2Controller {
  constructor(private readonly employeesService: EmployeesV2Service) { }

  /**
   * CREATE: Crea un nuevo empleado.
   * El employee_number se generará automáticamente en el servicio si no se envía.
   * METHOD: POST /v2/employees
   */
  @Post()
  create(@Body() createEmployeeDto: CreateEmployeeDto) {
    return this.employeesService.create(createEmployeeDto);
  }

  /**
   * READ (ALL): Paginación y filtrado dinámico.
   * Usamos POST en lugar de GET para poder enviar un JSON complejo en el Body (el Record<string, any>).
   * METHOD: POST /v2/employees/search
   */
  @Post('search')
  @HttpCode(HttpStatus.OK) // Retorna 200 OK en lugar del 201 Created por defecto de los POST
  searchPaginated(@Body() searchDto: SearchEmployeeDto) {
    return this.employeesService.findAllPaginated(searchDto);
  }

  // 👉 GET /employees/role?role=Admin
  // 👉 GET /employees/role?role=Admin,Sales
  @Get('role')
  async findByRole(
    @Query(
      'role',
      new ParseArrayPipe({ items: String, separator: ',', optional: true })
    )
    roles?: string[],
  ) {
    console.log("-------------- findByRole -------------");
    console.log("roles buscados:", roles);

    if (!roles || roles.length === 0) {
      throw new BadRequestException('Se requiere al menos un rol (query param "role")');
    }

    return this.employeesService.findByRoles(roles);
  }

  /**
   * READ: Lightweight endpoint for external microservices to match employees
   * METHOD: GET /v2/employees/list/danubanet
   */
  @Get('list/danubanet')
  getDanubanetList() {
    return this.employeesService.getDanubanetList();
  }

  @Get('organigram')
async getOrganigram(@Res() res: Response) {
  const image = await this.employeesService.getOrganigramPng();

  res.set({
    'Content-Type': 'image/png',
    'Content-Disposition': 'inline; filename="organigram.png"',
    'Content-Length': image.length.toString(),
    'Cache-Control': 'no-store',
  });

  res.send(image);
}

  /**
   * READ (ONE): Obtiene la información de un empleado específico por su employee_number.
   * METHOD: GET /v2/employees/:employee_number
   */
  @Get(':employee_number')
  findOne(@Param('employee_number') employeeNumber: string) {
    return this.employeesService.findByEmployeeNumber(employeeNumber);
  }

  /**
   * UPDATE: Actualiza parcialmente los datos de un empleado.
   * METHOD: PATCH /v2/employees/:employee_number
   */
  @Patch(':employee_number')
  update(
    @Param('employee_number') employeeNumber: string,
    @Body() updateEmployeeDto: UpdateEmployeeDto
  ) {
    return this.employeesService.update(employeeNumber, updateEmployeeDto);
  }

  /**
   * DELETE (SOFT): Desactiva a un empleado cambiando su status a 'Inactive'.
   * METHOD: DELETE /v2/employees/:employee_number
   */
  @Delete(':employee_number')
  remove(@Param('employee_number') employeeNumber: string) {
    return this.employeesService.softDelete(employeeNumber);
  }
}
import { 
  Controller, 
  Get, 
  Post, 
  Body, 
  Patch, 
  Param, 
  Delete, 
  HttpCode,
  HttpStatus
} from '@nestjs/common';
import { EmployeesV2Service } from './employees-v2.service';
import { CreateEmployeeDto } from '../employees/dto/create-employee.dto';
import { UpdateEmployeeDto } from '../employees/dto/update-employee.dto';
import { SearchEmployeeDto } from './dto/filter-employee.dto';


@Controller('v2/employees')
export class EmployeesV2Controller {
  constructor(private readonly employeesService: EmployeesV2Service) {}

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
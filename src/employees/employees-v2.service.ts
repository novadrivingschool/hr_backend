import { Injectable, NotFoundException, ConflictException, InternalServerErrorException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Brackets } from 'typeorm';
import { Employee } from '../employees/entities/employee.entity';
import { CreateEmployeeDto } from '../employees/dto/create-employee.dto';
import { UpdateEmployeeDto } from '../employees/dto/update-employee.dto';
import { SearchEmployeeDto } from './dto/filter-employee.dto';


@Injectable()
export class EmployeesV2Service {
  constructor(
    @InjectRepository(Employee)
    private readonly employeeRepo: Repository<Employee>,
  ) { }

  /**
   * Función utilitaria privada equivalente a la de Python.
   * Genera: NOVA + Inicial Nombre + Inicial Apellido + HHMMSS
   */
  private generateEmployeeNumber(name?: string, lastName?: string): string {
    const firstInitial = name && name.trim().length > 0 ? name.trim().charAt(0).toUpperCase() : 'X';
    const lastInitial = lastName && lastName.trim().length > 0 ? lastName.trim().charAt(0).toUpperCase() : 'X';

    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');

    const currentTime = `${hours}${minutes}${seconds}`;

    return `NOVA${firstInitial}${lastInitial}${currentTime}`;
  }

  async create(createEmployeeDto: CreateEmployeeDto): Promise<Employee> {
    try {
      // Si el frontend no manda el employee_number, lo autogeneramos como en el legacy
      if (!createEmployeeDto.employee_number) {
        createEmployeeDto.employee_number = this.generateEmployeeNumber(
          createEmployeeDto.name,
          createEmployeeDto.last_name
        );
      }

      const newEmployee = this.employeeRepo.create(createEmployeeDto);
      return await this.employeeRepo.save(newEmployee);
    } catch (error) {
      if (error.code === '23505') {
        throw new ConflictException(`El empleado con número ${createEmployeeDto.employee_number} ya existe.`);
      }
      throw new InternalServerErrorException('Error interno al crear el empleado.');
    }
  }

  /**
   * Paginación y Filtrado 100% DINÁMICO
   */
  async findAllPaginated(searchDto: SearchEmployeeDto) {
    const { page = 1, limit = 10, filters = {} } = searchDto;
    const skip = (page - 1) * limit;

    const queryBuilder = this.employeeRepo.createQueryBuilder('employee');

    const status = filters.status || 'Active';
    if (status !== 'All') {
      queryBuilder.andWhere("employee.status = :status", { status });
    }

    for (const [key, value] of Object.entries(filters)) {
      if (value === undefined || value === null || value === '' || key === 'status') {
        continue;
      }

      if (key === 'search') {
        queryBuilder.andWhere(
          new Brackets((qb) => {
            qb.where('employee.name ILIKE :search', { search: `%${value}%` })
              .orWhere('employee.last_name ILIKE :search', { search: `%${value}%` })
              .orWhere('employee.employee_number ILIKE :search', { search: `%${value}%` });
          }),
        );
        continue;
      }

      queryBuilder.andWhere(`employee.${key}::text ILIKE :${key}`, { [key]: `%${value}%` });
    }

    queryBuilder.orderBy('employee.id', 'DESC')
      .skip(skip)
      .take(limit);

    const [data, total] = await queryBuilder.getManyAndCount();

    return {
      data,
      meta: {
        total,
        page,
        last_page: Math.ceil(total / limit),
        limit,
      },
    };
  }

  async findByEmployeeNumber(employeeNumber: string): Promise<Employee> {
    const employee = await this.employeeRepo.findOne({
      where: { employee_number: employeeNumber },
      relations: ['permissions_relation'],
    });

    if (!employee) {
      throw new NotFoundException(`Empleado ${employeeNumber} no encontrado.`);
    }
    return employee;
  }

  async update(employeeNumber: string, updateEmployeeDto: UpdateEmployeeDto): Promise<Employee> {
    const employee = await this.findByEmployeeNumber(employeeNumber);
    const updatedEmployee = this.employeeRepo.merge(employee, updateEmployeeDto);
    return await this.employeeRepo.save(updatedEmployee);
  }

  async softDelete(employeeNumber: string): Promise<{ message: string }> {
    const employee = await this.findByEmployeeNumber(employeeNumber);
    employee.status = 'Inactive';
    await this.employeeRepo.save(employee);
    return { message: `El empleado ${employeeNumber} fue desactivado correctamente.` };
  }

  /**
   * Busca empleados activos que contengan al menos uno de los roles proporcionados.
   * Busca en el campo JSON 'roles'.
   */
  async findByRoles(roles: string[]): Promise<Employee[]> {
    // Limpiamos los roles quitando espacios extra y valores nulos
    const cleanedRoles = roles.map(r => r?.trim()).filter(Boolean);

    if (cleanedRoles.length === 0) {
      throw new BadRequestException('No valid roles provided');
    }

    const qb = this.employeeRepo
      .createQueryBuilder('e')
      .select([
        'e.id',
        'e.name',
        'e.last_name',
        'e.employee_number',
        'e.roles',
        'e.status'
      ])
      .where('e.status = :status', { status: 'Active' });

    // Armamos la consulta para buscar dentro del arreglo JSON 'roles'
    qb.andWhere(new Brackets(sqb => {
      cleanedRoles.forEach((role, i) => {
        // Casteamos a jsonb para usar el operador de contención @>
        sqb.orWhere(`(e.roles::jsonb @> :role${i}::jsonb)`, {
          [`role${i}`]: JSON.stringify([role]),
        });
      });
    }));

    // Ordenamos para que la respuesta sea consistente
    qb.orderBy('e.last_name', 'ASC').addOrderBy('e.name', 'ASC');

    return qb.getMany();
  }

  // Returns only active employees with a danubanet_name_1 to optimize performance
  async getDanubanetList() {
    return await this.employeeRepo.find({
      select: ['employee_number', 'name', 'last_name', 'danubanet_name_1'],
      where: {
        status: 'Active',
      },
    });
  }
}
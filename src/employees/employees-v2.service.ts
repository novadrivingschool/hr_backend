import { Injectable, NotFoundException, ConflictException, InternalServerErrorException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Brackets } from 'typeorm';
import { Employee } from '../employees/entities/employee.entity';
import { CreateEmployeeDto } from '../employees/dto/create-employee.dto';
import { UpdateEmployeeDto } from '../employees/dto/update-employee.dto';
import { SearchEmployeeDto } from './dto/filter-employee.dto';
import * as fs from 'fs/promises';
import * as path from 'path';
import puppeteer from 'puppeteer';


type OrgPerson = {
  employee_number: string;
  full_name: string;
  nova_email: string;
  departments: string[];
  positions: string[];
};

type OrgDepartment = {
  department: string;
  coordinators: OrgPerson[];
  staff: OrgPerson[];
  total_members: number;
};

type OrganigramData = {
  generated_at: string;
  total_top_management: number;
  total_departments: number;
  total_employees_processed: number;
  top_management: OrgPerson[];
  departments: OrgDepartment[];
};

type OrgTier = 'Leader' | 'Coordinator' | 'Staff';

type OrganigramPerson = {
  employee_number: string;
  full_name: string;
  nova_email: string;
  departments: string[];
  positions: string[];
  tier: OrgTier;
};

type DepartmentOrganigram = {
  department: string;
  leaders: OrganigramPerson[];
  coordinators: OrganigramPerson[];
  staff: OrganigramPerson[];
  total_members: number;
};


@Injectable()
export class EmployeesV2Service {
  constructor(
    @InjectRepository(Employee)
    private readonly employeeRepo: Repository<Employee>,
  ) { }

  private async resolveOrganigramTemplatePath(): Promise<string> {
    const possiblePaths = [
      path.join(process.cwd(), 'dist', 'src', 'employees', 'templates', 'organigram.html'),
      path.join(process.cwd(), 'dist', 'employees', 'templates', 'organigram.html'),
      path.join(process.cwd(), 'src', 'employees', 'templates', 'organigram.html'),
      path.join(__dirname, 'templates', 'organigram.html'),
    ];

    for (const filePath of possiblePaths) {
      try {
        await fs.access(filePath);
        return filePath;
      } catch {
        // seguimos probando
      }
    }

    throw new Error(
      `organigram.html no fue encontrado. Rutas probadas:\n${possiblePaths.join('\n')}`
    );
  }

  private async buildOrganigramHtml(data: any): Promise<string> {
    const templatePath = await this.resolveOrganigramTemplatePath();
    const template = await fs.readFile(templatePath, 'utf8');
    const safeJson = JSON.stringify(data).replace(/</g, '\\u003c');

    return template.replace('__ORG_DATA__', safeJson);
  }

  private normalizeStringArray(value: unknown): string[] {
    if (Array.isArray(value)) {
      return [...new Set(
        value
          .map((v) => String(v ?? '').trim())
          .filter(Boolean)
      )];
    }

    if (typeof value === 'string' && value.trim()) {
      return [...new Set(
        value
          .split(',')
          .map((v) => v.trim())
          .filter(Boolean)
      )];
    }

    return [];
  }

  private normalizePositions(positions: string[]): string[] {
    return positions.map((p) => p.trim().toLowerCase());
  }

  private isTopManagement(positions: string[]): boolean {
    const normalized = this.normalizePositions(positions);
    return normalized.includes('director') || normalized.includes('manager');
  }

  private isCoordinator(positions: string[]): boolean {
    const normalized = this.normalizePositions(positions);
    return normalized.includes('coordinator');
  }

  private sortPeople(a: OrgPerson, b: OrgPerson): number {
    return a.full_name.localeCompare(b.full_name);
  }

  private async buildOrganigramData(): Promise<OrganigramData> {
    const employees = await this.employeeRepo.find({
      select: [
        'employee_number',
        'name',
        'last_name',
        'nova_email',
        'status',
        'multi_department',
        'multi_position',
      ],
      where: {
        status: 'Active',
      },
    });

    const topManagementMap = new Map<string, OrgPerson>();
    const departmentsMap = new Map<string, OrgDepartment>();

    for (const employee of employees) {
      const departments = this.normalizeStringArray(employee.multi_department);
      const positions = this.normalizeStringArray(employee.multi_position);

      const person: OrgPerson = {
        employee_number: employee.employee_number,
        full_name:
          `${employee.name || ''} ${employee.last_name || ''}`.trim() ||
          employee.employee_number,
        nova_email: employee.nova_email || '',
        departments,
        positions,
      };

      if (this.isTopManagement(positions)) {
        if (!topManagementMap.has(person.employee_number)) {
          topManagementMap.set(person.employee_number, person);
        }
        continue;
      }

      if (!departments.length) continue;

      for (const department of departments) {
        if (!departmentsMap.has(department)) {
          departmentsMap.set(department, {
            department,
            coordinators: [],
            staff: [],
            total_members: 0,
          });
        }

        const dept = departmentsMap.get(department)!;

        if (this.isCoordinator(positions)) {
          dept.coordinators.push(person);
        } else {
          dept.staff.push(person);
        }
      }
    }

    const top_management = Array.from(topManagementMap.values())
      .sort((a, b) => this.sortPeople(a, b));

    const departments = Array.from(departmentsMap.values())
      .map((dept) => {
        dept.coordinators.sort((a, b) => this.sortPeople(a, b));
        dept.staff.sort((a, b) => this.sortPeople(a, b));
        dept.total_members = dept.coordinators.length + dept.staff.length;
        return dept;
      })
      .sort((a, b) => a.department.localeCompare(b.department));

    return {
      generated_at: new Date().toISOString(),
      total_top_management: top_management.length,
      total_departments: departments.length,
      total_employees_processed: employees.length,
      top_management,
      departments,
    };
  }

  private getTier(positions: string[]): OrgTier {
    const normalized = positions.map(p => p.trim().toLowerCase());

    if (normalized.includes('director') || normalized.includes('manager')) {
      return 'Leader';
    }

    if (normalized.includes('coordinator')) {
      return 'Coordinator';
    }

    return 'Staff';
  }


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
        'e.status',
        'e.multi_location',
        'e.multi_company',
        'e.nova_email',
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


  async getOrganigramPng(): Promise<Buffer> {
    const data = await this.buildOrganigramData();
    const html = await this.buildOrganigramHtml(data);

    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    try {
      const page = await browser.newPage();

      page.setDefaultNavigationTimeout(0);
      page.setDefaultTimeout(0);

      await page.setViewport({
        width: 1600,
        height: 1200,
        deviceScaleFactor: 2,
      });

      await page.setContent(html, {
        waitUntil: 'domcontentloaded',
        timeout: 0,
      });

      await page.waitForSelector('#app', { timeout: 0 });

      await page.evaluate(async () => {
        await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
        await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
      });

      const dimensions = await page.evaluate(() => {
        const body = document.body;
        const doc = document.documentElement;

        return {
          width: Math.max(
            body.scrollWidth,
            body.offsetWidth,
            doc.clientWidth,
            doc.scrollWidth,
            doc.offsetWidth,
            1600,
          ),
          height: Math.max(
            body.scrollHeight,
            body.offsetHeight,
            doc.clientHeight,
            doc.scrollHeight,
            doc.offsetHeight,
            900,
          ),
        };
      });

      await page.setViewport({
        width: Math.ceil(dimensions.width),
        height: Math.ceil(dimensions.height),
        deviceScaleFactor: 2,
      });

      await page.evaluate(async () => {
        await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
        await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
      });

      const image = await page.screenshot({
        type: 'png',
        fullPage: true,
      });

      return Buffer.from(image);
    } finally {
      await browser.close();
    }
  }


}
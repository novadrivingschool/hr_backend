import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ArrayOverlap, Brackets, ILike, In, Raw, Repository } from 'typeorm';
import { Employee } from './entities/employee.entity';
import { FindByRolesDto } from './dto/find-by-role.dto';
import { UpdateEquipmentStatusDto } from './dto/update-equipment-status.dto';
import { SearchEmployeeDto } from './dto/filter-employee.dto';

type EmpMinimal = { name: string; last_name: string; employee_number: string };


@Injectable()
export class EmployeesService {
  constructor(
    @InjectRepository(Employee)
    private readonly employeeRepo: Repository<Employee>,
  ) { }

  async findAll(): Promise<Employee[]> {
    return this.employeeRepo.find({
      where: { status: 'Active' },
    });
  }

  async findByDepartment(department: string | string[]): Promise<Employee[]> {
    const qb = this.employeeRepo
      .createQueryBuilder('e')
      .select(['e.name', 'e.last_name', 'e.employee_number', 'e.multi_department'])
      .where('e.status = :status', { status: 'Active' });

    // Normaliza entrada a array
    const depts = Array.isArray(department)
      ? department
      : (department ? [department] : []);

    const cleaned = depts.map(d => d?.trim()).filter(Boolean);

    // Si viene vacío o contiene "all" (cualquier caso) => NO filtrar por dept
    const containsAll = cleaned.some(d => d.toLowerCase() === 'all');
    const shouldFilter = cleaned.length > 0 && !containsAll;

    if (shouldFilter) {
      qb.andWhere(new Brackets(sqb => {
        cleaned.forEach((d, i) => {
          // ⚠️ multi_department es JSON → casteamos a JSONB en ambos lados
          sqb.orWhere(`(e.multi_department::jsonb @> :dept${i}::jsonb)`, {
            [`dept${i}`]: JSON.stringify([d]),
          });
        });
      }));
    }

    return qb.getMany();
  }


  // ===========================
  // BÚSQUEDA POR NOMBRE COMPLETO
  // ===========================

  // Normaliza: quita acentos, pasa a minúsculas, colapsa espacios
  private normalize(s: string): string {
    return (s ?? '')
      .normalize('NFD')
      .replace(/\p{Diacritic}+/gu, '') // quita acentos
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
  }

  // divide en palabras (letras/números), p.ej. "Cuzco Bautista" -> ["cuzco","bautista"]
  private tokenizeNormalized(s: string): string[] {
    const n = this.normalize(s);
    const tokens = n.split(/[^a-z0-9]+/g).filter(Boolean);
    return tokens;
  }

  // chequeo rápido: ¿a y b son iguales o a 1 edición? (sin crear DP grande)
  private equalOrOneEdit(a: string, b: string): boolean {
    if (a === b) return true;
    const la = a.length, lb = b.length;
    if (Math.abs(la - lb) > 1) return false;

    let i = 0, j = 0, edits = 0;
    while (i < la && j < lb) {
      if (a[i] === b[j]) {
        i++; j++;
      } else {
        edits++;
        if (edits > 1) return false;
        if (la > lb) {
          i++; // eliminación en a
        } else if (lb > la) {
          j++; // inserción en a
        } else {
          i++; j++; // sustitución
        }
      }
    }
    // puede quedar un char extra al final
    if (i < la || j < lb) edits++;
    return edits <= 1;
  }

  // scorea un candidato: +2 por match exacto, +1 por match a 1 edición; requiere cubrir TODOS los tokens
  private scoreCandidate(queryTokens: string[], emp: EmpMinimal): { ok: boolean; score: number } {
    const empTokens = [
      ...this.tokenizeNormalized(emp.name),
      ...this.tokenizeNormalized(emp.last_name),
    ];

    let score = 0;

    for (const qt of queryTokens) {
      // encuentra el mejor match de qt dentro de los tokens del empleado
      let best = 0;
      for (const et of empTokens) {
        if (qt === et) { best = Math.max(best, 2); if (best === 2) break; }
        else if (this.equalOrOneEdit(qt, et)) { best = Math.max(best, 1); }
      }
      if (best === 0) return { ok: false, score: 0 }; // algún token no está -> descarta
      score += best;
    }
    return { ok: true, score };
  }

  /**
   * Busca por fullName, ignorando mayúsculas/acentos, exige que TODOS los tokens del query
   * aparezcan como palabras en (name + last_name) del empleado.
   * Tolera 1 edición por token (Isamel≈Ismael), pero evita "park"≈"parker".
   */
  async findByFullNameStrict(fullName: string): Promise<EmpMinimal | null> {
    const qNorm = this.normalize(fullName);
    if (!qNorm) return null;

    const qTokens = this.tokenizeNormalized(qNorm);
    if (qTokens.length < 2) return null; // p.ej. "NORRIDGE" -> null

    // 1) Consulta acotada: trae candidatos donde name o last_name contengan CUALQUIER token
    //    (ILIKE es case-insensitive, suficiente para recortar resultados)
    const qb = this.employeeRepo
      .createQueryBuilder('e')
      .select(['e.name AS name', 'e.last_name AS last_name', 'e.employee_number AS employee_number'])
      .where('e.status = :st', { st: 'Active' });

    const orBlocks: string[] = [];
    const params: Record<string, any> = {};
    qTokens.forEach((t, i) => {
      const p = `t${i}`;
      params[p] = `%${t}%`;
      orBlocks.push(`(e.name ILIKE :${p} OR e.last_name ILIKE :${p})`);
    });
    qb.andWhere(orBlocks.join(' OR '), params);

    // puedes ajustar el límite si tu tabla es muy grande
    qb.limit(200);

    const possibles = await qb.getRawMany<EmpMinimal>();
    if (possibles.length === 0) return null;

    // 2) Validación exacta (normalizada) + puntuación en JS
    let best: EmpMinimal | null = null;
    let bestScore = -1;

    for (const emp of possibles) {
      const { ok, score } = this.scoreCandidate(qTokens, emp);
      if (!ok) continue;
      // desempates sencillos: mayor score primero; si empatan, menos tokens totales en el registro
      if (score > bestScore) {
        best = emp; bestScore = score;
      } else if (score === bestScore && best) {
        const bestLen = this.tokenizeNormalized(best.name).length + this.tokenizeNormalized(best.last_name).length;
        const currLen = this.tokenizeNormalized(emp.name).length + this.tokenizeNormalized(emp.last_name).length;
        if (currLen < bestLen) best = emp;
      }
    }

    return best;
  }

  async findActiveManagersAndCoordinators(dto: FindByRolesDto) {
    const depts = (dto.departments || []).map(d => (d ?? '').trim()).filter(Boolean);
    const deptsLower = depts.map(d => d.toLowerCase());
    if (deptsLower.length === 0) {
      throw new BadRequestException('At least one department is required');
    }

    return this.employeeRepo
      .createQueryBuilder('e')
      .select([
        'e.id', 'e.name', 'e.last_name', 'e.employee_number', 'e.status',
        'e.position', 'e.multi_department', 'e.multi_company',
        'e.multi_location', 'e.nova_email',
      ])
      .where('e.status = :active', { active: 'Active' })
      .andWhere(
        `
      (
        -- Managers SIEMPRE entran (ignora departments)
        e.position = :manager
        OR
        -- Coordinators SOLO si hay intersección con departments enviados
        (
          e.position = :coordinator
          AND EXISTS (
            SELECT 1
            FROM jsonb_array_elements_text(
                   CASE
                     WHEN jsonb_typeof(e.multi_department::jsonb) = 'array'
                     THEN e.multi_department::jsonb
                     ELSE '[]'::jsonb
                   END
                 ) AS d(val)
            WHERE TRIM(LOWER(d.val)) IN (:...deptsLower)
          )
        )
      )
      `,
        {
          manager: 'Manager',
          coordinator: 'Coordinator',
          deptsLower,
        },
      )
      .orderBy('e.position', 'ASC')
      .addOrderBy('e.last_name', 'ASC')
      .addOrderBy('e.name', 'ASC')
      .getMany();
  }

  async findCoordinatorsEmailsByDepartments(
    dto: { departments: string[] }
  ): Promise<string[]> {
    console.log('>>> [findCoordinatorsEmailsByDepartments] dto:', dto);

    // 1) Normaliza entradas
    const norm = (s: string) => s.toLowerCase().trim().replace(/\s+/g, ' ');
    const depts = (dto.departments ?? [])
      .map(d => (d ?? '').trim())
      .filter(Boolean);

    const deptsNorm = depts.map(norm);

    console.log('>>> Departamentos originales:', depts);
    console.log('>>> Departamentos normalizados:', deptsNorm);

    if (deptsNorm.length === 0) {
      throw new BadRequestException('At least one department is required');
    }

    // 2) Ejecuta query
    const rows = await this.employeeRepo
      .createQueryBuilder('e')
      .select('DISTINCT LOWER(TRIM(e.nova_email))', 'email')
      .where(`TRIM(LOWER(e.status)) = 'active'`)
      .andWhere(`NULLIF(TRIM(e.nova_email), '') IS NOT NULL`)
      .andWhere(`TRIM(LOWER(e.position)) = :coordinator`, {
        coordinator: 'coordinator',
      })
      .andWhere(
        `
      EXISTS (
        SELECT 1
        FROM jsonb_array_elements_text(
               CASE
                 WHEN jsonb_typeof(e.multi_department::jsonb) = 'array'
                 THEN e.multi_department::jsonb
                 ELSE '[]'::jsonb
               END
             ) AS d(val)
        WHERE
          regexp_replace(TRIM(LOWER(d.val)), '\\s+', ' ', 'g')
          IN (:...deptsNorm)
      )
      `,
        { deptsNorm }
      )
      .orderBy('1', 'ASC')
      .getRawMany<{ email: string }>();

    console.log('>>> Filas crudas devueltas por la query:', rows);

    const result = rows.map(r => r.email);

    console.log('>>> Emails finales normalizados:', result);

    return result;
  }

  async updateEquipmentStatusByEmployeeNumber(
    employeeNumber: string,
    dto: UpdateEquipmentStatusDto,
  ): Promise<Employee> {
    const employee = await this.employeeRepo.findOne({
      where: { employee_number: employeeNumber },
    });

    if (!employee) {
      throw new NotFoundException(
        `Employee with number ${employeeNumber} not found`,
      );
    }

    employee.has_assigned_equipment = dto.has_assigned_equipment;
    return this.employeeRepo.save(employee);
  }

  async getSupervisorsEmailsByEmployeeNumber(employeeNumber: string): Promise<string[]> {
    // Trae SOLO la columna supervisors para no cargar de más
    const row = await this.employeeRepo
      .createQueryBuilder('e')
      .select('e.supervisors', 'supervisors')
      .where('e.employee_number = :employeeNumber', { employeeNumber })
      .getRawOne<{ supervisors: any[] }>();

    if (!row) throw new NotFoundException(`Employee ${employeeNumber} not found`);

    const supervisors = Array.isArray(row.supervisors) ? row.supervisors : [];
    const emails = supervisors
      .map(s => (s?.nova_email || s?.email || '').trim())
      .filter(Boolean);

    // dedupe
    return Array.from(new Set(emails));
  }

  /**
 * Busca empleados con status 'Active' por posición.
 */
  async findActiveByPosition(positions: string | string[]) {
    console.log('>>> [findActiveByPosition] positions input:', positions);
    const positionsArray = Array.isArray(positions) ? positions : [positions];
    const validPositions = positionsArray.filter(p => p && p.trim() !== '');

    if (validPositions.length === 0) {
      throw new BadRequestException('At least one valid position is required');
    }

    return this.employeeRepo.find({
      where: {
        status: 'Active',
        multi_position: Raw(
          (alias) => {
            // El alias llega como "Employee.multi_position". 
            // Lo separamos y lo envolvemos en comillas: '"Employee"."multi_position"'
            const quotedAlias = alias
              .split('.')
              .map((part) => `"${part.replace(/"/g, '')}"`) // Quitamos comillas previas por si acaso
              .join('.');

            return `EXISTS (SELECT 1 FROM jsonb_array_elements_text(${quotedAlias}::jsonb) AS element WHERE element IN (:...validPositions))`;
          },
          { validPositions }
        ),
      },
      order: { last_name: 'ASC', name: 'ASC' },
      select: {
        name: true,
        last_name: true,
        employee_number: true,
      },
    });
  }

  async filter(params: SearchEmployeeDto) {
    // 1. Extraer metadata y el objeto de filtros
    const { page = 1, limit = 10, filters = {} } = params;
    const skip = (page - 1) * limit;

    // 2. Crear QueryBuilder y SELECCIONAR solo las columnas necesarias
    const qb = this.employeeRepo.createQueryBuilder('employee')
      .select([
        'employee.id',
        'employee.employee_number',
        'employee.name',
        'employee.last_name',
        'employee.nova_email',
        'employee.danubanet_name_1',
        'employee.danubanet_name_2'
      ]);

    // 3. Iterar sobre las llaves del objeto 'filters' de forma segura
    Object.keys(filters).forEach((key) => {
      const value = filters[key];

      // Ignorar valores vacíos, nulos o indefinidos
      if (value === undefined || value === null || value === '') return;

      // Verificar existencia de la columna en la base de datos (Seguridad)
      const column = this.employeeRepo.metadata.findColumnWithPropertyName(key);

      if (column) {
        const paramName = `param_${key}`;

        // Lógica de tipos para armar el SQL correcto
        if (column.type === 'jsonb' || column.type === 'json') {
          // Arrays JSONB (ej: multi_position, multi_department)
          const jsonValue = Array.isArray(value) ? JSON.stringify(value) : JSON.stringify([value]);
          qb.andWhere(`employee.${key}::jsonb @> :${paramName}::jsonb`, { [paramName]: jsonValue });
        }
        else if (column.type === String || column.type === 'varchar' || column.type === 'text') {
          // Strings: Búsqueda parcial (ej: nombre, email)
          qb.andWhere(`employee.${key} ILIKE :${paramName}`, { [paramName]: `%${value}%` });
        }
        else if (column.type === Boolean || column.type === 'boolean') {
          // Booleanos (ej: status si lo manejas como bool, has_assigned_equipment)
          const boolValue = value === 'true' || value === true;
          qb.andWhere(`employee.${key} = :${paramName}`, { [paramName]: boolValue });
        }
        else {
          // Números, Fechas, etc. (Búsqueda exacta)
          qb.andWhere(`employee.${key} = :${paramName}`, { [paramName]: value });
        }
      }
    });

    // 4. Ordenamiento por defecto
    qb.orderBy('employee.id', 'DESC');

    // 5. Ejecutar la consulta con la paginación
    const [data, total] = await qb
      .skip(skip)
      .take(limit)
      .getManyAndCount();

    // 6. Retornar la respuesta estructurada
    return {
      data,
      meta: {
        total,
        page,
        limit,
        last_page: Math.ceil(total / limit)
      },
    };
  }

  async updateDanubanetName(employeeNumber: string, danubanetName: string) {
    // 1. Buscamos al empleado por su número de empleado (ej. "NOVANT164810")
    const employee = await this.employeeRepo.findOne({
      where: { employee_number: employeeNumber },
      select: ['id', 'employee_number', 'name', 'last_name', 'danubanet_name_1']
    });

    // Si no existe, lanzamos el error 404
    if (!employee) {
      throw new NotFoundException(`Empleado con número ${employeeNumber} no encontrado.`);
    }

    // 2. Actualizamos el valor
    employee.danubanet_name_1 = danubanetName;

    // 3. Guardamos en la base de datos
    await this.employeeRepo.save(employee);

    // 4. Retornamos la respuesta
    return {
      message: 'Danubanet name actualizado correctamente',
      data: {
        employee_number: employee.employee_number,
        name: employee.name,
        danubanet_name_1: employee.danubanet_name_1
      }
    };
  }

  async searchByDanubanet(names: string[]) {
    // Iniciamos la consulta y seleccionamos las propiedades requeridas
    const qb = this.employeeRepo.createQueryBuilder('employee')
      .select([
        'employee.id',
        'employee.employee_number',
        'employee.name',
        'employee.last_name',
        'employee.nova_email',
        'employee.danubanet_name_1',
        'employee.danubanet_name_2',
        'employee.address'
      ]);

    // Buscamos si ALGUNO de los nombres provistos hace match con el campo 1 O el campo 2
    // Usamos la sintaxis IN (:...names) de TypeORM para manejar arreglos
    qb.where('employee.danubanet_name_1 IN (:...names)', { names })
      .orWhere('employee.danubanet_name_2 IN (:...names)', { names });

    // Ordenamos por ID para mantener consistencia
    qb.orderBy('employee.id', 'DESC');

    // Ejecutamos la consulta
    const employees = await qb.getMany();

    // Retornamos la data estructurada
    return {
      data: employees,
      meta: {
        total: employees.length,
        matched_names_provided: names.length
      }
    };
  }
}

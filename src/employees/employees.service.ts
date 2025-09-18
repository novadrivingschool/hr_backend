import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Raw, Repository } from 'typeorm';
import { Employee } from './entities/employee.entity';
import { FindByRolesDto } from './dto/find-by-role.dto';
import { UpdateEquipmentStatusDto } from './dto/update-equipment-status.dto';

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
      /* 
      select: ['name', 'last_name', 'employee_number', 'department', 'company', 'country', 'location'], */
    });
  }

  /* async findByDepartment(department: string): Promise<Employee[]> {
    const where: any = { status: 'Active' };

    if (department !== 'all') {
      where.department = department;
    }

    return this.employeeRepo.find({
      where,
      select: ['name', 'last_name', 'employee_number', 'multi_department'],
    });
  } */
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

  // employees.service.ts
  /* async findActiveManagersAndCoordinatorsEmails(dto: FindByRolesDto): Promise<string[]> {
    const depts = (dto.departments || []).map(d => (d ?? '').trim()).filter(Boolean);
    const deptsLower = depts.map(d => d.toLowerCase());
    if (deptsLower.length === 0) {
      throw new BadRequestException('At least one department is required');
    }

    // Trae solo los correos, únicos, no vacíos y en minúsculas
    const rows = await this.employeeRepo
      .createQueryBuilder('e')
      .select('DISTINCT LOWER(TRIM(e.nova_email))', 'email') // <-- solo emails únicos
      .where('e.status = :active', { active: 'Active' })
      .andWhere(`NULLIF(TRIM(e.nova_email), '') IS NOT NULL`) // <-- evita vacíos
      .andWhere(
        `
      (        
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
          coordinator: 'Coordinator',
          deptsLower,
        },
      )
      .orderBy('1', 'ASC') // opcional: ordena alfabéticamente por el alias 'email'
      .getRawMany<{ email: string }>();

    return rows.map(r => r.email);
  } */
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


}

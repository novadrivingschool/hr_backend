import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Employee } from './entities/employee.entity';

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
      select: ['name', 'last_name', 'employee_number', 'department', 'company', 'country', 'location'],
    });
  }

  /* async findByDepartment(department: string): Promise<Employee[]> {
    return this.employeeRepo.find({
      where: {
        status: 'Active',
        department,
      },
      select: ['name', 'last_name', 'employee_number', 'department'],
    });
  } */
  async findByDepartment(department: string): Promise<Employee[]> {
    const where: any = { status: 'Active' };

    if (department !== 'all') {
      where.department = department;
    }

    return this.employeeRepo.find({
      where,
      select: ['name', 'last_name', 'employee_number', 'department'],
    });
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

}

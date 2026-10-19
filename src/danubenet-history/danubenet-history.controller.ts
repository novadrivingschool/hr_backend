import { Controller, Post, Get, Body, Query, Param, NotFoundException } from '@nestjs/common';
import { DanubenetHistoryService } from './danubenet-history.service';
import { EmployeesService } from '../employees/employees.service';
import { DanubenetHistory } from './entities/danubenet-history.entity';

interface ResolveItem {
  name: string;
  date: string; // YYYY-MM-DD
}

interface IdentityItem {
  /** Employee number, when the caller already knows it. */
  employee_number?: string | null;
  /** Nickname or DanubeNet name typed by the user (used when there is no employee_number). */
  identifier?: string | null;
  /** YYYY-MM-DD — decides which DanubeNet tramo applies. */
  date?: string | null;
}

type IdentityStatus = 'OK' | 'NOT_FOUND' | 'AMBIGUOUS' | 'INVALID';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

interface ResolveResult {
  name: string | null;
  date: string | null;
  employee_number: string | null;
  full_name: string | null;
  address: string | null;
}

@Controller('danubenet-history')
export class DanubenetHistoryController {
  constructor(
    private readonly service: DanubenetHistoryService,
    private readonly employeesService: EmployeesService,
  ) {}

  /**
   * Resuelve en batch employee_number (+ full_name/address) para pares
   * (name, date) contra la fuente correcta (danubenet_history, match
   * exacto normalizado + tramo por fecha) — mismo mecanismo que ya usan
   * internamente Instructor/Teacher/Assignment/No-Show payroll (ver
   * DanubenetHistoryService).
   * Pensado para microservicios externos (ej. accounting_backend,
   * fleet_service/mapping) que no tienen acceso directo a esta tabla ni a
   * este proceso.
   *
   * full_name/address vienen de employees, buscados por el employee_number
   * ya resuelto — así el consumidor externo no necesita un segundo golpe a
   * /employees/danubanet/search (que además usa el campo estático
   * danubanet_name_1/2, no el historial).
   *
   * Sin match = employee_number/full_name/address null, sin fallback a
   * nada (mismo criterio que resolveEmployeeNumber/resolveSegment ya usan).
   */
  @Post('resolve-batch')
  async resolveBatch(
    @Body() body: { items: ResolveItem[] },
  ): Promise<{ results: ResolveResult[] }> {
    const items = Array.isArray(body?.items) ? body.items : [];
    const index = await this.service.buildIndex();

    const resolved = items.map((item) => ({
      name: item?.name ?? null,
      date: item?.date ?? null,
      employee_number:
        item?.name && item?.date
          ? this.service.resolveEmployeeNumber(index, item.name, item.date)
          : null,
    }));

    const employeeNumbers = Array.from(
      new Set(
        resolved
          .map((r) => r.employee_number)
          .filter((n): n is string => !!n),
      ),
    );
    const employees = await this.employeesService.findBasicByNumbers(employeeNumbers);
    const employeeByNumber = new Map(employees.map((e) => [e.employee_number, e]));

    const results: ResolveResult[] = resolved.map((r) => {
      const emp = r.employee_number ? employeeByNumber.get(r.employee_number) : undefined;
      return {
        ...r,
        full_name: emp ? `${emp.name} ${emp.last_name}`.trim() : null,
        address: emp ? (emp.address || null) : null,
      };
    });

    return { results };
  }

  // ─── Identity (accounting: Earnings & Deductions) ──────────────────────────

  private toIdentity(e: any) {
    return {
      employee_number: e.employee_number,
      name: e.name ?? '',
      last_name: e.last_name ?? '',
      full_name: `${e.name ?? ''} ${e.last_name ?? ''}`.trim(),
      nickname: e.nickname ?? '',
      multi_company: Array.isArray(e.multi_company) ? e.multi_company : [],
      hire_date: e.hire_date ?? null,
      status: e.status ?? null,
    };
  }

  private toHistory(rows: DanubenetHistory[]) {
    return rows.map((r) => ({
      danubenet_name: r.danubenet_name,
      start_date: r.start_date,
      end_date: r.end_date,
    }));
  }

  /**
   * Resuelve a QUÉ empleado se refiere cada fila, en este orden:
   *   1. `employee_number` (si viene).
   *   2. `identifier` como NICKNAME (match exacto normalizado).
   *   3. `identifier` como DANUBENET NAME en `danubenet_history`, usando `date`
   *      para elegir el tramo vigente (misma regla que payroll).
   * 0 coincidencias → NOT_FOUND; 2+ → AMBIGUOUS; nunca se adivina.
   * Además devuelve el danubenet_name que el empleado tiene en `date`.
   */
  @Post('resolve-identities')
  async resolveIdentities(@Body() body: { items: IdentityItem[] }) {
    const items = Array.isArray(body?.items) ? body.items : [];
    const index = await this.service.buildIndex();

    const historyByEmp = new Map<string, DanubenetHistory[]>();
    for (const list of index.values()) {
      for (const r of list) {
        const arr = historyByEmp.get(r.employee_number) ?? [];
        arr.push(r);
        historyByEmp.set(r.employee_number, arr);
      }
    }

    const nicknameIndex = new Map<string, any[]>();
    for (const e of await this.employeesService.findAllWithNickname()) {
      const key = this.service.normalizeKey(e.nickname);
      if (!key) continue;
      const arr = nicknameIndex.get(key) ?? [];
      arr.push(e);
      nicknameIndex.set(key, arr);
    }

    const empCache = new Map<string, any | null>();
    const preload = Array.from(
      new Set(items.map((i) => String(i?.employee_number ?? '').trim()).filter(Boolean)),
    );
    for (const e of await this.employeesService.findIdentityByNumbers(preload)) {
      empCache.set(e.employee_number, e);
    }
    const getEmp = async (num: string) => {
      if (!empCache.has(num)) {
        const [e] = await this.employeesService.findIdentityByNumbers([num]);
        empCache.set(num, e ?? null);
      }
      return empCache.get(num);
    };

    const results: any[] = [];
    for (const item of items) {
      const number = String(item?.employee_number ?? '').trim();
      const ident = String(item?.identifier ?? '').trim();
      const date = item?.date && ISO_DATE.test(String(item.date).trim()) ? String(item.date).trim() : null;

      const out = (status: IdentityStatus, message: string, extra: any = {}) => ({
        status, message, matched_by: null, employee: null, danubenet_name: null, ...extra,
      });

      let emp: any = null;
      let matchedBy: 'employee_number' | 'nickname' | 'danubenet' | null = null;
      let seg: DanubenetHistory | null = null;

      if (number) {
        emp = await getEmp(number);
        if (!emp) { results.push(out('NOT_FOUND', `Employee number "${number}" not found`)); continue; }
        matchedBy = 'employee_number';
      } else if (ident) {
        const cands = nicknameIndex.get(this.service.normalizeKey(ident)) ?? [];
        if (cands.length === 1) {
          emp = cands[0];
          matchedBy = 'nickname';
        } else if (cands.length > 1) {
          results.push(out('AMBIGUOUS',
            `Nickname "${ident}" belongs to ${cands.length} employees (${cands.map((c) => c.employee_number).join(', ')})`));
          continue;
        } else {
          if (!date) {
            results.push(out('INVALID',
              `"${ident}" is not a nickname; a valid date (YYYY-MM-DD) is required to look it up as a DanubeNet name`));
            continue;
          }
          seg = this.service.resolveSegment(index, ident, date);
          if (!seg) {
            results.push(out('NOT_FOUND', `"${ident}" is not a nickname and no DanubeNet name matches it on ${date}`));
            continue;
          }
          emp = await getEmp(seg.employee_number);
          if (!emp) { results.push(out('NOT_FOUND', `Employee ${seg.employee_number} (DanubeNet "${seg.danubenet_name}") not found`)); continue; }
          matchedBy = 'danubenet';
        }
      } else {
        results.push(out('INVALID', 'employee_number or identifier is required'));
        continue;
      }

      const current = seg ?? this.service.pickAt(historyByEmp.get(emp.employee_number) ?? [], date);
      results.push({
        status: 'OK' as IdentityStatus,
        message: '',
        matched_by: matchedBy,
        employee: this.toIdentity(emp),
        danubenet_name: current?.danubenet_name ?? null,
      });
    }
    return { results };
  }

  /**
   * Búsqueda libre para el selector de empleado: nombre, apellido, número,
   * nickname o DanubeNet name (cualquier tramo). Cada resultado trae su
   * historial de danubenet para que la UI calcule el vigente por fecha.
   */
  @Get('employee-search')
  async employeeSearch(@Query('q') q?: string, @Query('limit') limit?: string) {
    const term = String(q ?? '').trim();
    if (term.length < 2) return { results: [] };
    const lim = Math.min(Math.max(parseInt(limit ?? '25', 10) || 25, 1), 50);

    const hits = await this.service.searchByName(term);
    const extra = Array.from(new Set(hits.map((h) => h.employee_number)));
    const emps = await this.employeesService.searchIdentity(term, lim, extra);
    const history = await this.service.findByEmployees(emps.map((e) => e.employee_number));
    const byEmp = new Map<string, DanubenetHistory[]>();
    for (const h of history) {
      const arr = byEmp.get(h.employee_number) ?? [];
      arr.push(h);
      byEmp.set(h.employee_number, arr);
    }
    return {
      results: emps.map((e) => ({
        ...this.toIdentity(e),
        danubenet_history: this.toHistory(byEmp.get(e.employee_number) ?? []),
      })),
    };
  }

  /** Identidad completa (nickname, companies, historial de danubenet) de un empleado. */
  @Get('employee-identity/:employee_number')
  async employeeIdentity(@Param('employee_number') employeeNumber: string) {
    const [emp] = await this.employeesService.findIdentityByNumbers([String(employeeNumber).trim()]);
    if (!emp) throw new NotFoundException(`Employee ${employeeNumber} not found`);
    const history = await this.service.findByEmployees([emp.employee_number]);
    return { ...this.toIdentity(emp), danubenet_history: this.toHistory(history) };
  }
}

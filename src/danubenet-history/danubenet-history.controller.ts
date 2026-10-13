import { Controller, Post, Body } from '@nestjs/common';
import { DanubenetHistoryService } from './danubenet-history.service';
import { EmployeesService } from '../employees/employees.service';

interface ResolveItem {
  name: string;
  date: string; // YYYY-MM-DD
}

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
}

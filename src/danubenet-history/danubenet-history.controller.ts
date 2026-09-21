import { Controller, Post, Body } from '@nestjs/common';
import { DanubenetHistoryService } from './danubenet-history.service';

interface ResolveItem {
  name: string;
  date: string; // YYYY-MM-DD
}

interface ResolveResult {
  name: string | null;
  date: string | null;
  employee_number: string | null;
}

@Controller('danubenet-history')
export class DanubenetHistoryController {
  constructor(private readonly service: DanubenetHistoryService) {}

  /**
   * Resuelve en batch employee_number para pares (name, date) contra la
   * fuente correcta (danubenet_history, match exacto normalizado + tramo
   * por fecha) — mismo mecanismo que ya usan internamente Instructor/
   * Teacher/Assignment/No-Show payroll (ver DanubenetHistoryService).
   * Pensado para microservicios externos (ej. accounting_backend) que no
   * tienen acceso directo a esta tabla ni a este proceso.
   *
   * Sin match = employee_number null, sin fallback a nada (mismo criterio
   * que resolveEmployeeNumber/resolveSegment ya usan).
   */
  @Post('resolve-batch')
  async resolveBatch(
    @Body() body: { items: ResolveItem[] },
  ): Promise<{ results: ResolveResult[] }> {
    const items = Array.isArray(body?.items) ? body.items : [];
    const index = await this.service.buildIndex();

    const results: ResolveResult[] = items.map((item) => ({
      name: item?.name ?? null,
      date: item?.date ?? null,
      employee_number:
        item?.name && item?.date
          ? this.service.resolveEmployeeNumber(index, item.name, item.date)
          : null,
    }));

    return { results };
  }
}

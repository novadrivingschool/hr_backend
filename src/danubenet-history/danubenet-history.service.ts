import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DanubenetHistory } from './entities/danubenet-history.entity';

/** employee_number resuelto para un danubenet_name, indexado por nombre normalizado. */
export type DanubenetIndex = Map<string, DanubenetHistory[]>;

@Injectable()
export class DanubenetHistoryService {
  constructor(
    @InjectRepository(DanubenetHistory)
    private readonly repo: Repository<DanubenetHistory>,
  ) {}

  /**
   * Normalización tolerante: lowercase y solo alfanuméricos, para que
   * variantes de puntuación/espacios del Excel ("Suarez Petit, Wilmer J"
   * vs "Suarez Petit Wilmer J.") matcheen igual. Misma regla que
   * normalize_danubenet_name en nova-one-backend (catálogo) — mantener en sync.
   */
  private normalize(name: string | null | undefined): string {
    return String(name ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  /**
   * Trae TODO el historial y arma un índice en memoria por danubenet_name
   * normalizado. Se llama una sola vez por request (no por fila) — el
   * volumen esperado de danubenet_history es bajo (altas/bajas manuales de
   * empleados), a diferencia de las tablas de payroll que pueden tener
   * decenas de miles de filas por rango de fechas.
   */
  async buildIndex(): Promise<DanubenetIndex> {
    const rows = await this.repo.find();
    const index: DanubenetIndex = new Map();
    for (const row of rows) {
      const key = this.normalize(row.danubenet_name);
      if (!key) continue;
      const list = index.get(key) ?? [];
      list.push(row);
      index.set(key, list);
    }
    return index;
  }

  /**
   * Resuelve el employee_number dueño de `danubenetName` en la fecha
   * `date` (YYYY-MM-DD), buscando el tramo de danubenet_history cuyo rango
   * [start_date, end_date|indefinido] contiene esa fecha. Si no hay ningún
   * tramo que la contenga, devuelve null — sin fallback a otro campo.
   */
  resolveEmployeeNumber(index: DanubenetIndex, danubenetName: string, date: string): string | null {
    return this.resolveSegment(index, danubenetName, date)?.employee_number ?? null;
  }

  /**
   * Igual que resolveEmployeeNumber pero devuelve el TRAMO completo (fila de
   * danubenet_history) que resolvió, no solo el employee_number — necesario
   * cuando además de saber DE QUIÉN es un registro hace falta saber A QUÉ
   * tramo administrativo pertenece (ej: un mismo empleado puede tener el
   * mismo danubenet_name en 2+ tramos no contiguos, y el resumen de
   * Instructor/Teacher los muestra como filas separadas).
   */
  resolveSegment(index: DanubenetIndex, danubenetName: string, date: string): DanubenetHistory | null {
    const key = this.normalize(danubenetName);
    if (!key || !date) return null;

    const candidates = index.get(key);
    if (!candidates?.length) return null;

    return (
      candidates.find((r) => r.start_date <= date && (!r.end_date || r.end_date >= date)) ?? null
    );
  }
}

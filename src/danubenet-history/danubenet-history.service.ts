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
   * Llave alterna independiente del ORDEN de las palabras: "Buddy  Bell" y
   * "Bell, Buddy" dan la misma llave. Se separa por espacios/comas, se limpia
   * cada token (apóstrofes, puntos, etc.), se descartan vacíos y se ordenan.
   * Solo se usa como fallback cuando el match exacto de `normalize` falla,
   * así el comportamiento previo no cambia.
   */
  private normalizeUnordered(name: string | null | undefined): string {
    const tokens = String(name ?? '')
      .toLowerCase()
      .split(/[\s,]+/)
      .map((t) => t.replace(/[^a-z0-9]/g, ''))
      .filter(Boolean)
      .sort();
    return tokens.length ? `~${tokens.join(' ')}` : '';
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

    const inRange = (r: DanubenetHistory) =>
      r.start_date <= date && (!r.end_date || r.end_date >= date);

    // 1) match exacto normalizado (comportamiento previo)
    const exact = index.get(key)?.find(inRange);
    if (exact) return exact;

    // 2) fallback: mismas palabras en otro orden ("Buddy Bell" ~ "Bell, Buddy")
    // (el índice sigue indexado solo por `normalize`; el volumen de
    // danubenet_history es bajo, así que el barrido solo ocurre si el exacto falló)
    const unorderedKey = this.normalizeUnordered(danubenetName);
    if (!unorderedKey) return null;
    for (const list of index.values()) {
      const hit = list.find(
        (r) => inRange(r) && this.normalizeUnordered(r.danubenet_name) === unorderedKey,
      );
      if (hit) return hit;
    }
    return null;
  }
}

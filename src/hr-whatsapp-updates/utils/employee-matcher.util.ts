import axios from 'axios';
import { Logger } from '@nestjs/common';

export interface NovaOneEmployee {
  employee_number: string;
  name: string;
  last_name: string;
}

export interface EmployeeMatch {
  employee_number: string;
  name: string;
  last_name: string;
}

export interface EmployeeIndex {
  byFullName: Map<string, NovaOneEmployee>;
  byFirstName: Map<string, NovaOneEmployee[]>;
  byLastName: Map<string, NovaOneEmployee[]>;
}

const logger = new Logger('EmployeeMatcher');

/**
 * Normaliza un nombre para comparar: minúsculas, sin espacios ni signos.
 * Mismo criterio que ya usa `norm()` en ip-summary.service.ts.
 */
export function normalizeName(value: string | null | undefined): string {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Trae TODOS los empleados desde nova-one-backend (GET {NOVA_ONE_API}/employees) —
 * el mismo endpoint que ya usa ip-summary.service.ts para armar sus reportes.
 * Nunca lanza: si falla o la env var no está seteada, devuelve [] y el
 * llamador simplemente no podrá matchear (todo cae a "_other").
 */
export async function fetchNovaOneEmployees(): Promise<NovaOneEmployee[]> {
  const baseUrl = (process.env.NOVA_ONE_API ?? '').trim();
  if (!baseUrl) {
    logger.warn('NOVA_ONE_API no está configurada — no se podrán matchear empleados contra nova-one-backend');
    return [];
  }

  try {
    const res = await axios.get(`${baseUrl.replace(/\/+$/, '')}/employees`);
    const list = res.data?.employees ?? (Array.isArray(res.data) ? res.data : []);
    return Array.isArray(list) ? list : [];
  } catch (error) {
    logger.error(`No se pudo obtener la lista de empleados de nova-one-backend: ${error.message}`);
    return [];
  }
}

/**
 * Arma un índice para matchear texto libre contra empleados, tolerando que
 * nombre y apellido vengan en cualquier orden (ej. "Pérez Juan" o
 * "Juan Pérez") o que solo venga uno de los dos. El match es siempre EXACTO
 * tras normalizar — deliberadamente no hay aproximación difusa (Levenshtein,
 * etc.) para no correr el riesgo de asignar un registro al empleado
 * equivocado.
 */
export function buildEmployeeIndex(employees: NovaOneEmployee[]): EmployeeIndex {
  const byFullName = new Map<string, NovaOneEmployee>();
  const byFirstName = new Map<string, NovaOneEmployee[]>();
  const byLastName = new Map<string, NovaOneEmployee[]>();

  const pushTo = (map: Map<string, NovaOneEmployee[]>, key: string, emp: NovaOneEmployee) => {
    if (!key) return;
    const arr = map.get(key) ?? [];
    arr.push(emp);
    map.set(key, arr);
  };

  for (const emp of employees) {
    if (!emp?.employee_number) continue;

    const name = normalizeName(emp.name);
    const lastName = normalizeName(emp.last_name);

    if (name && lastName) {
      const nameFirst = `${name}${lastName}`; // "Juan Perez"  -> "juanperez"
      const lastFirst = `${lastName}${name}`; // "Perez Juan"  -> "perezjuan"
      if (!byFullName.has(nameFirst)) byFullName.set(nameFirst, emp);
      if (!byFullName.has(lastFirst)) byFullName.set(lastFirst, emp);
    }

    pushTo(byFirstName, name, emp);
    pushTo(byLastName, lastName, emp);
  }

  return { byFullName, byFirstName, byLastName };
}

/**
 * Intenta matchear un texto libre (ej. "Sara Jarrín", "Jarrín Sara", "Jen")
 * contra el índice de empleados. Devuelve `null` si no hay match único y
 * confiable — en ese caso el llamador debe guardar el texto original en el
 * campo "_other" en vez de forzar un match incorrecto.
 */
export function matchEmployee(rawText: string, index: EmployeeIndex): EmployeeMatch | null {
  const normalized = normalizeName(rawText);
  if (!normalized) return null;

  const toMatch = (emp: NovaOneEmployee): EmployeeMatch => ({
    employee_number: emp.employee_number,
    name: emp.name,
    last_name: emp.last_name,
  });

  // Tier 1: "nombre apellido" o "apellido nombre" completos, en cualquier orden.
  const exact = index.byFullName.get(normalized);
  if (exact) return toMatch(exact);

  // Tier 2: el Excel solo trae una palabra — aceptar solo si es única (sin ambigüedad
  // entre varios empleados que compartan ese nombre o apellido).
  const byFirst = index.byFirstName.get(normalized);
  if (byFirst && byFirst.length === 1) return toMatch(byFirst[0]);

  const byLast = index.byLastName.get(normalized);
  if (byLast && byLast.length === 1) return toMatch(byLast[0]);

  return null;
}

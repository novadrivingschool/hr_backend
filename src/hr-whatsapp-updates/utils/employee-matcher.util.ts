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
  employees: NovaOneEmployee[];
  // employee_number -> conjunto de TODAS las palabras normalizadas de su
  // nombre + apellido (ej. name="Daniela Maria", last_name="Salazar Lopez"
  // -> {daniela, maria, salazar, lopez}). Es lo que permite matchear
  // aunque el Excel solo traiga un subconjunto ("Daniela Salazar") o en
  // otro orden ("Salazar Daniela").
  tokensByEmployee: Map<string, Set<string>>;
  // employee_number -> palabras de name+last_name EN ORDEN (no un Set) —
  // usado para el desempate por adyacencia cuando 2+ empleados comparten
  // todas las palabras del texto (ver `isContiguous` en matchEmployee).
  orderedTokensByEmployee: Map<string, string[]>;
  // palabra normalizada -> empleados que la tienen en nombre o apellido.
  // Índice invertido para no recorrer TODA la plantilla en cada match.
  employeesByToken: Map<string, NovaOneEmployee[]>;
}

const logger = new Logger('EmployeeMatcher');

// Rango unicode de diacríticos combinantes (U+0300–U+036F), construido con
// fromCharCode para evitar problemas de encoding al escribir el literal
// "̀-ͯ" directamente en el código fuente (mismo criterio que
// HrWhatsappUpdatesService.DIACRITICS_REGEX).
const DIACRITICS_REGEX = new RegExp(
  `[${String.fromCharCode(0x0300)}-${String.fromCharCode(0x036f)}]`,
  'g',
);

/**
 * Normaliza un nombre completo para comparar: minúsculas, sin acentos, sin
 * espacios ni signos. Útil para comparar un solo campo de una — no separa
 * en palabras (ver `tokenize` para eso).
 */
export function normalizeName(value: string | null | undefined): string {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(DIACRITICS_REGEX, '')
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Separa un texto en palabras normalizadas (minúsculas, sin acentos, sin
 * signos). Es la base del matching por "conjunto de tokens": a diferencia de
 * `normalizeName` (que concatena todo en un solo string), esto permite
 * comparar nombre/apellido sin importar el orden en que vengan ni cuántas
 * palabras tenga cada campo.
 */
function tokenize(value: string | null | undefined): string[] {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(DIACRITICS_REGEX, '')
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
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
 * Arma el índice de matching por CONJUNTO DE PALABRAS (no por string
 * concatenado). Esto es clave porque en la BD de empleados el "nombre" y/o
 * "apellido" pueden tener dos (o más) palabras — ej. name="Daniela Maria",
 * last_name="Salazar Lopez" — mientras que en el Excel casi siempre viene
 * solo una palabra de cada uno, y en cualquier orden ("Daniela Salazar",
 * "Salazar Daniela", "Salazar Lopez Daniela", etc.). Comparando por
 * conjunto de tokens (en vez de un string armado con un orden fijo) el
 * match funciona sin importar orden, cuántas palabras tenga cada campo en
 * la BD, ni cuántas de esas palabras trajo el Excel.
 */
export function buildEmployeeIndex(employees: NovaOneEmployee[]): EmployeeIndex {
  const tokensByEmployee = new Map<string, Set<string>>();
  const orderedTokensByEmployee = new Map<string, string[]>();
  const employeesByToken = new Map<string, NovaOneEmployee[]>();

  for (const emp of employees) {
    if (!emp?.employee_number) continue;

    const ordered = [...tokenize(emp.name), ...tokenize(emp.last_name)];
    if (!ordered.length) continue;
    const tokens = new Set(ordered);

    tokensByEmployee.set(emp.employee_number, tokens);
    orderedTokensByEmployee.set(emp.employee_number, ordered);
    for (const t of tokens) {
      const arr = employeesByToken.get(t) ?? [];
      // Un mismo empleado no debe repetirse en la lista de un token (ya
      // viene de un Set, pero por las dudas si hubiera duplicados en la
      // lista de origen de nova-one-backend).
      if (!arr.some((e) => e.employee_number === emp.employee_number)) arr.push(emp);
      employeesByToken.set(t, arr);
    }
  }

  return { employees, tokensByEmployee, orderedTokensByEmployee, employeesByToken };
}

/**
 * ¿Aparece `query` (en ese orden exacto) como bloque contiguo dentro de
 * `full`? Ej. isContiguous(['vanessa','arcos'], ['erika','vanessa','arcos',
 * 'barahona']) -> true (están seguidas); isContiguous(['vanessa','arcos'],
 * ['jessica','vanessa','calle','arcos']) -> false ("calle" las separa).
 */
function isContiguous(query: string[], full: string[]): boolean {
  if (!query.length || query.length > full.length) return false;
  for (let i = 0; i <= full.length - query.length; i++) {
    let matches = true;
    for (let j = 0; j < query.length; j++) {
      if (full[i + j] !== query[j]) {
        matches = false;
        break;
      }
    }
    if (matches) return true;
  }
  return false;
}

function toMatch(emp: NovaOneEmployee): EmployeeMatch {
  return { employee_number: emp.employee_number, name: emp.name, last_name: emp.last_name };
}

/**
 * Intersección de las listas de empleados de cada token (índice invertido) —
 * devuelve solo los empleados que tienen TODOS los tokens pedidos en su
 * nombre+apellido, sin recorrer la plantilla completa.
 */
function candidatesWithAllTokens(tokens: string[], index: EmployeeIndex): NovaOneEmployee[] {
  if (!tokens.length) return [];

  let candidates: NovaOneEmployee[] | null = null;
  for (const t of tokens) {
    const list = index.employeesByToken.get(t) ?? [];
    if (candidates === null) {
      candidates = list;
    } else {
      const ids = new Set(list.map((e) => e.employee_number));
      candidates = candidates.filter((e) => ids.has(e.employee_number));
    }
    if (!candidates.length) return [];
  }
  return candidates ?? [];
}

/**
 * Intenta matchear un texto libre (ej. "Sara Jarrín", "Jarrín Sara", "Daniela
 * Salazar" cuando en la BD el empleado es name="Daniela Maria" / last_name=
 * "Salazar Gomez", o simplemente "Jen") contra el índice de empleados.
 * Devuelve `null` si no hay match único y confiable — en ese caso el
 * llamador debe guardar el texto original en el campo "_other" en vez de
 * forzar un match incorrecto.
 *
 * Deliberadamente NO hay aproximación difusa (Levenshtein, similitud, etc.):
 * todo match exige que CADA palabra del texto exista literalmente (tras
 * normalizar) entre las palabras de nombre + apellido del empleado (name +
 * last_name — ningún otro campo). Lo único "inteligente" acá es que no
 * importa el ORDEN de las palabras ni que el empleado tenga más palabras de
 * las que trajo el Excel — nunca se adivina una palabra que no está.
 */
export function matchEmployee(rawText: string, index: EmployeeIndex): EmployeeMatch | null {
  const tokens = tokenize(rawText);
  if (!tokens.length) return null;

  // Tier 1: empleados cuyo nombre+apellido contiene TODAS las palabras del
  // texto (en cualquier orden, sin importar cuántas palabras más tenga el
  // registro del empleado en la BD).
  const candidates = candidatesWithAllTokens(tokens, index);

  if (candidates.length === 1) return toMatch(candidates[0]);

  if (candidates.length > 1) {
    // Ambiguo (varios empleados contienen todas las palabras del texto) —
    // ej. "Vanessa Arcos" puede matchear tanto a "Erika Vanessa Arcos
    // Barahona" como a "Jessica Vanessa Calle Arcos" (ambas tienen "vanessa"
    // Y "arcos"). Antes de rendirse, se prueban 2 desempates EXACTOS (nunca
    // aproximados):

    // Desempate 1: ADYACENCIA. Si las palabras del texto aparecen SEGUIDAS
    // (en ese orden, o en el orden invertido por si el Excel puso apellido
    // primero) dentro del nombre completo de un único candidato, es el match
    // correcto — es literalmente "Vanessa Arcos" como frase, no una mezcla
    // de campos distintos. En el ejemplo, "vanessa arcos" está seguido en
    // "Erika VANESSA ARCOS Barahona" pero NO en "Jessica Vanessa Calle
    // ARCOS" (los separa "Calle") -> resuelve a la primera sin ambigüedad.
    const reversedTokens = [...tokens].reverse();
    const adjacent = candidates.filter((emp) => {
      const ordered = index.orderedTokensByEmployee.get(emp.employee_number) ?? [];
      return isContiguous(tokens, ordered) || isContiguous(reversedTokens, ordered);
    });
    if (adjacent.length === 1) return toMatch(adjacent[0]);

    // Desempate 2: candidato "más ajustado" — el que tenga MENOS palabras de
    // más respecto al texto (ej. un empleado con exactamente esas 2 palabras
    // es más confiable que uno con 4 palabras que también las contiene).
    const pool = adjacent.length > 1 ? adjacent : candidates;
    const scored = pool
      .map((emp) => ({
        emp,
        extra: (index.tokensByEmployee.get(emp.employee_number)?.size ?? Infinity) - tokens.length,
      }))
      .sort((a, b) => a.extra - b.extra);

    const minExtra = scored[0].extra;
    const tightest = scored.filter((c) => c.extra === minExtra);
    if (tightest.length === 1) return toMatch(tightest[0].emp);

    // Sigue ambiguo incluso desempatando -> no forzar, queda para revisión
    // manual (cae a *_other).
    return null;
  }

  // Tier 2: ninguna coincidencia con TODAS las palabras — si el texto es una
  // sola palabra (ej. "Jen"), aceptar solo si esa palabra es única entre
  // TODOS los nombres/apellidos de la empresa (sin ambigüedad).
  if (tokens.length === 1) {
    const single = index.employeesByToken.get(tokens[0]) ?? [];
    if (single.length === 1) return toMatch(single[0]);
  }

  return null;
}

export interface MatchDebugInfo {
  rawText: string;
  tokens: string[];
  totalEmployeesInIndex: number;
  // Empleados que YA fueron descartados a nivel de índice porque no tienen
  // NINGUNA palabra en común (útil para ver si el problema es que el
  // empleado ni siquiera llegó al índice — ver totalEmployeesInIndex).
  tier1Candidates: EmployeeMatch[];
  adjacentCandidates: EmployeeMatch[];
  tightestCandidates: EmployeeMatch[];
  tier2SingleTokenCandidates: EmployeeMatch[];
  result: EmployeeMatch | null;
}

/**
 * Misma lógica que `matchEmployee`, pero devolviendo CADA paso intermedio en
 * vez de solo el resultado final. Pensado para diagnosticar en el ambiente
 * real (vía un endpoint de debug) por qué un texto puntual no matchea, sin
 * tener que adivinar a ciegas: cuántos empleados llegaron al índice (si da 0,
 * el problema es NOVA_ONE_API / fetchNovaOneEmployees, no el matching en sí),
 * cuántos candidatos hay en cada tier, y cuál gana en cada desempate.
 */
export function debugMatchEmployee(rawText: string, index: EmployeeIndex): MatchDebugInfo {
  const tokens = tokenize(rawText);
  const tier1Candidates = candidatesWithAllTokens(tokens, index);

  let adjacentCandidates: NovaOneEmployee[] = [];
  let tightestCandidates: NovaOneEmployee[] = [];
  let tier2SingleTokenCandidates: NovaOneEmployee[] = [];

  if (tier1Candidates.length > 1) {
    const reversedTokens = [...tokens].reverse();
    adjacentCandidates = tier1Candidates.filter((emp) => {
      const ordered = index.orderedTokensByEmployee.get(emp.employee_number) ?? [];
      return isContiguous(tokens, ordered) || isContiguous(reversedTokens, ordered);
    });

    const pool = adjacentCandidates.length > 1 ? adjacentCandidates : tier1Candidates;
    const scored = pool
      .map((emp) => ({
        emp,
        extra: (index.tokensByEmployee.get(emp.employee_number)?.size ?? Infinity) - tokens.length,
      }))
      .sort((a, b) => a.extra - b.extra);
    const minExtra = scored[0]?.extra;
    tightestCandidates = scored.filter((c) => c.extra === minExtra).map((c) => c.emp);
  }

  if (tier1Candidates.length === 0 && tokens.length === 1) {
    tier2SingleTokenCandidates = index.employeesByToken.get(tokens[0]) ?? [];
  }

  return {
    rawText,
    tokens,
    totalEmployeesInIndex: index.employees.length,
    tier1Candidates: tier1Candidates.map(toMatch),
    adjacentCandidates: adjacentCandidates.map(toMatch),
    tightestCandidates: tightestCandidates.map(toMatch),
    tier2SingleTokenCandidates: tier2SingleTokenCandidates.map(toMatch),
    result: matchEmployee(rawText, index),
  };
}

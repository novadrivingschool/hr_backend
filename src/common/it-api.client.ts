import axios from 'axios';

/**
 * Thin client for it_backend's generic `/notifications` resource (the
 * single admin navbar bell). Any module in this backend can call
 * `pushBellNotification()` at the point where it already sends its
 * best-effort emails, without needing to know anything about how the
 * frontend renders or polls the bell.
 *
 * Mirrors the same "best-effort, never throws into the caller's main
 * transaction" convention used by TimeOffApiClient (api/time-off.api.ts):
 * callers are expected to wrap this in their own non-blocking try/catch,
 * same as the existing email sends.
 */
export interface PushBellNotificationInput {
  category: string;
  type: string;
  title: string;
  message: string;
  link?: string;
  source_id?: string;
  recipients: string[];
}

function baseUrl(): string {
  const url = (process.env.IT_API_URL ?? '').trim();
  if (!url) {
    throw new Error('IT_API_URL is not configured');
  }
  return url.replace(/\/+$/, '');
}

export async function pushBellNotification(input: PushBellNotificationInput): Promise<void> {
  const url = `${baseUrl()}/notifications`;
  // 2026-08-30: logging explicito pedido por el usuario -- hasta ahora un
  // fallo/exito de este POST no dejaba ningun rastro propio, solo lo que el
  // caller decidiera loguear en su catch (i-care.service.ts). Con 3 intentos
  // de fix sin poder confirmar si el request sale y que responde IT API,
  // esto da visibilidad directa en la consola de hr_backend.
  console.log(
    `[pushBellNotification] POST ${url} category=${input.category} type=${input.type} ` +
    `recipients=${input.recipients.length} [${input.recipients.join(',')}]`,
  );
  try {
    const resp = await axios.post(
      url,
      { ...input, source_service: 'hr_backend' },
      { timeout: 7000 },
    );
    console.log(`[pushBellNotification] ✅ OK (${resp.status}) type=${input.type} source_id=${input.source_id ?? ''}`);
  } catch (err: any) {
    const detail = err?.response
      ? `HTTP ${err.response.status} ${JSON.stringify(err.response.data)}`
      : (err?.code || err?.message || String(err));
    console.error(`[pushBellNotification] ❌ FAILED POST ${url} type=${input.type}: ${detail}`);
    throw err;
  }
}

/**
 * Resolves the employee_numbers currently holding any of the given roles,
 * via nova-one-backend's existing `/employees/filter` endpoint (the same
 * one the frontend's Notification Routing panel already uses to search
 * people, and which already filters `Employees.roles` as a JSONB column).
 *
 * We snapshot this list at notification-creation time rather than
 * re-resolving roles when the bell is read later: it keeps historical
 * notifications stable and avoids coupling it_backend to this service's
 * permission model at read time.
 */
export async function resolveEmployeeNumbersByRoles(roles: string[]): Promise<string[]> {
  const nova = (process.env.NOVA_ONE_API ?? '').trim().replace(/\/+$/, '');
  if (!nova) {
    throw new Error('NOVA_ONE_API is not configured');
  }

  const PER_PAGE = 100;
  const MAX_PAGES = 10; // safety valve: 1000 employees per role is plenty

  const fetchByRole = async (role: string): Promise<string[]> => {
    const numbers: string[] = [];
    // Page until a short page (or the safety cap): a single page=1 call
    // silently truncated roles with more than PER_PAGE active holders.
    for (let page = 1; page <= MAX_PAGES; page++) {
      const resp = await axios.post(
        `${nova}/employees/filter?page=${page}&per_page=${PER_PAGE}`,
        { status: 'Active', permissions: role },
        { timeout: 7000 },
      );
      const rows: any[] = resp.data?.data ?? [];
      numbers.push(...rows.map((e) => String(e?.employee_number || '').trim()).filter(Boolean));
      if (rows.length < PER_PAGE) break;
    }
    return numbers;
  };

  // allSettled: a failure resolving one role (e.g. a typo'd role name)
  // shouldn't wipe out recipients successfully resolved for the others.
  //
  // 2026-08-28: antes esto tragaba el error de cada rol en absoluto silencio
  // (ni un console.error) -- si NOVA_ONE_API estaba caido, o el body
  // {status,permissions} no era el que el servicio realmente espera, esta
  // funcion devolvia [] para TODOS los roles sin dejar ningun rastro
  // diagnosticable. Se agrega logging explicito (no cambia el contrato:
  // sigue devolviendo [] por rol fallido, no rompe a los demas).
  const settled = await Promise.allSettled(roles.map((role) => fetchByRole(role)));
  const perRole = settled.map((r, i) => {
    if (r.status === 'fulfilled') {
      console.log(`[resolveEmployeeNumbersByRoles] role='${roles[i]}' -> ${r.value.length} employee_number(s) via ${nova}/employees/filter`);
      return r.value;
    }
    const reason: any = r.reason;
    const detail = reason?.response
      ? `HTTP ${reason.response.status} ${JSON.stringify(reason.response.data)}`
      : (reason?.code || reason?.message || String(reason));
    console.error(`[resolveEmployeeNumbersByRoles] ❌ role='${roles[i]}' failed against ${nova}/employees/filter: ${detail}`);
    return [];
  });
  return [...new Set(perRole.flat())];
}

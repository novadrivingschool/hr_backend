import axios from 'axios';

/**
 * Consulta el flag de permiso de un empleado contra nova-one-backend
 * (`GET /permissions/<employee_number>`), la misma fuente de verdad que usa
 * la consola de permisos y que it_backend consulta desde
 * `it_backend/src/common/nova-one-permissions.client.ts`.
 *
 * hr_backend no comparte la base de datos de Postgres con nova-one-backend
 * (a diferencia de backend_activity_report), asi que esto es una llamada
 * HTTP server-to-server, no una query directa.
 *
 * Fail-closed: cualquier error de red, timeout, o respuesta sin el flag en
 * `true` se trata como "sin permiso" -- nunca se asume acceso por defecto.
 */
export async function hasNovaOnePermission(employeeNumber: string, permissionKey: string): Promise<boolean> {
  const nova = (process.env.NOVA_ONE_API ?? '').trim().replace(/\/+$/, '');
  const emp = String(employeeNumber ?? '').trim();
  if (!nova || !emp) return false;

  try {
    const resp = await axios.get(`${nova}/permissions/${encodeURIComponent(emp)}`, { timeout: 7000 });
    return resp.data?.[permissionKey] === true;
  } catch (err: any) {
    const detail = err?.response
      ? `HTTP ${err.response.status} ${JSON.stringify(err.response.data)}`
      : (err?.code || err?.message || String(err));
    console.error(`[hasNovaOnePermission] ❌ employee_number=${emp} key=${permissionKey} against ${nova}/permissions/${emp}: ${detail}`);
    return false;
  }
}

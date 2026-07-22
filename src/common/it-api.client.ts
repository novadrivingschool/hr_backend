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
  await axios.post(
    `${baseUrl()}/notifications`,
    { ...input, source_service: 'hr_backend' },
    { timeout: 7000 },
  );
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

  const fetchByRole = async (role: string): Promise<string[]> => {
    const resp = await axios.post(
      `${nova}/employees/filter?page=1&per_page=100`,
      { status: 'Active', permissions: role },
      { timeout: 7000 },
    );
    const rows: any[] = resp.data?.data ?? [];
    return rows.map((e) => String(e?.employee_number || '').trim()).filter(Boolean);
  };

  // allSettled: a failure resolving one role (e.g. a typo'd role name)
  // shouldn't wipe out recipients successfully resolved for the others.
  const settled = await Promise.allSettled(roles.map((role) => fetchByRole(role)));
  const perRole = settled.map((r) => (r.status === 'fulfilled' ? r.value : []));
  return [...new Set(perRole.flat())];
}

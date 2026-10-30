import { DanubenetHistoryController } from './danubenet-history.controller';
import { DanubenetHistoryService } from './danubenet-history.service';
import { VoutDirectoryUnavailableError } from './vout-directory.service';

describe('DanubenetHistoryController.resolveIdentities — V-Out fallback', () => {
  const service = new DanubenetHistoryService({} as any);
  const novaEmp = {
    employee_number: 'N1', name: 'Ana', last_name: 'Nova', nickname: 'Anita',
    multi_company: ['Nova'], hire_date: '2024-01-01', status: 'Active',
  };
  const voutRec = (n: string, nick: string, active = true) => ({
    employee_number: n, tcw_nickname: nick, first_name: 'Vic', last_name: 'Out',
    hire_date: '2025-02-02', is_active: active,
  });

  function build(opts: { history?: any[]; vout?: any[] | Error } = {}) {
    jest.spyOn(service, 'buildIndex').mockResolvedValue(new Map(
      (opts.history ?? []).map((h) => [service.normalizeKey(h.danubenet_name), [h]]),
    ) as any);
    const employees: any = {
      findAllWithNickname: jest.fn().mockResolvedValue([novaEmp]),
      findIdentityByNumbers: jest.fn().mockImplementation(async (nums: string[]) =>
        nums.includes('N1') ? [novaEmp] : []),
    };
    const vout: any = {
      fetchNicknameDirectory: jest.fn().mockImplementation(async () => {
        if (opts.vout instanceof Error) throw opts.vout;
        return opts.vout ?? [];
      }),
    };
    return { ctrl: new DanubenetHistoryController(service, employees, vout), vout };
  }

  it('nickname de Nova gana y NO consulta V-Out', async () => {
    const { ctrl, vout } = build({ vout: [voutRec('V1', 'Anita')] });
    const { results } = await ctrl.resolveIdentities({ items: [{ identifier: 'anita', date: '2026-10-01' }] });
    expect(results[0]).toMatchObject({ status: 'OK', matched_by: 'nickname' });
    expect(vout.fetchNicknameDirectory).not.toHaveBeenCalled();
  });

  it('DanubeNet gana sobre V-Out', async () => {
    const { ctrl, vout } = build({
      history: [{ danubenet_name: 'Zeta Z', employee_number: 'N1', start_date: '2026-01-01', end_date: null }],
      vout: [voutRec('V1', 'Zeta Z')],
    });
    const { results } = await ctrl.resolveIdentities({ items: [{ identifier: 'Zeta Z', date: '2026-10-01' }] });
    expect(results[0]).toMatchObject({ status: 'OK', matched_by: 'danubenet' });
    expect(vout.fetchNicknameDirectory).not.toHaveBeenCalled();
  });

  it('fallback a V-Out: datos salen de V-Out, incluso inactivos y sin fecha', async () => {
    const { ctrl, vout } = build({ vout: [voutRec('V9', 'Chuy', false)] });
    const { results } = await ctrl.resolveIdentities({
      items: [{ identifier: 'CHUY' }, { identifier: ' chuy ', date: '2026-10-01' }],
    });
    for (const r of results) {
      expect(r).toMatchObject({
        status: 'OK', matched_by: 'vout_nickname', danubenet_name: null,
        employee: { employee_number: 'V9', full_name: 'Vic Out', nickname: 'Chuy', status: 'Inactive', hire_date: '2025-02-02' },
      });
    }
    expect(vout.fetchNicknameDirectory).toHaveBeenCalledTimes(1); // una sola vez por request
  });

  it('no existe en ningún lado → NOT_FOUND', async () => {
    const { ctrl } = build({ vout: [voutRec('V1', 'Otro')] });
    const { results } = await ctrl.resolveIdentities({ items: [{ identifier: 'Nadie', date: '2026-10-01' }] });
    expect(results[0].status).toBe('NOT_FOUND');
  });

  it('V-Out caído → UNAVAILABLE (no NOT_FOUND)', async () => {
    const { ctrl } = build({ vout: new VoutDirectoryUnavailableError('down') });
    const { results } = await ctrl.resolveIdentities({ items: [{ identifier: 'Chuy', date: '2026-10-01' }] });
    expect(results[0].status).toBe('UNAVAILABLE');
  });

  it('employee_number explícito no toca V-Out', async () => {
    const { ctrl, vout } = build();
    const { results } = await ctrl.resolveIdentities({ items: [{ employee_number: 'N1' }] });
    expect(results[0]).toMatchObject({ status: 'OK', matched_by: 'employee_number' });
    expect(vout.fetchNicknameDirectory).not.toHaveBeenCalled();
  });
});

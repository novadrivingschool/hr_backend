import { DanubenetHistoryService, DanubenetIndex } from './danubenet-history.service';
import { DanubenetHistory } from './entities/danubenet-history.entity';

/**
 * Cubre el caso reportado: un mismo empleado usa un danubenet_name distinto
 * según el tramo de fechas (ej. "DN-001" del 1 al 15, "DN-002" del 16 al 31)
 * y el matching de Instructors/Teachers payroll debe resolver al MISMO
 * empleado en ambos tramos, sin depender de danubanet_name_1/2.
 */
describe('DanubenetHistoryService', () => {
  const row = (over: Partial<DanubenetHistory>): DanubenetHistory =>
    ({
      id: 0,
      employee_number: '',
      danubenet_name: '',
      start_date: '',
      end_date: null,
      notes: '',
      created_at: new Date(),
      created_by: '',
      ...over,
    }) as DanubenetHistory;

  let repo: any;
  let service: DanubenetHistoryService;

  beforeEach(() => {
    repo = { find: jest.fn() };
    service = new DanubenetHistoryService(repo);
  });

  describe('buildIndex', () => {
    it('agrupa por danubenet_name normalizado (lowercase alfanumérico) e ignora nombres vacíos', async () => {
      repo.find.mockResolvedValue([
        row({ id: 1, danubenet_name: '  DN-001  ', employee_number: 'E-100', start_date: '2026-01-01' }),
        row({ id: 2, danubenet_name: 'dn 001', employee_number: 'E-101', start_date: '2026-02-01' }),
        row({ id: 3, danubenet_name: '', employee_number: 'E-999', start_date: '2026-01-01' }),
      ]);

      const index = await service.buildIndex();
      expect(index.has('dn001')).toBe(true);
      expect(index.get('dn001')).toHaveLength(2);
      expect(index.size).toBe(1); // el registro con nombre vacío no se indexa
    });
  });

  describe('resolveEmployeeNumber', () => {
    it('caso del usuario: mismo empleado, name A del 1-15 y name B del 16-31 → matchea al mismo employee_number en cada tramo', () => {
      const index: DanubenetIndex = new Map([
        ['dna', [row({ danubenet_name: 'DN-A', employee_number: 'E-100', start_date: '2026-08-01', end_date: '2026-08-15' })]],
        ['dnb', [row({ danubenet_name: 'DN-B', employee_number: 'E-100', start_date: '2026-08-16', end_date: '2026-08-31' })]],
      ]);

      expect(service.resolveEmployeeNumber(index, 'DN-A', '2026-08-10')).toBe('E-100');
      expect(service.resolveEmployeeNumber(index, 'DN-B', '2026-08-20')).toBe('E-100');
    });

    it('tolera variantes de puntuación/espacios entre Excel e historial', () => {
      const index: DanubenetIndex = new Map([
        ['suarezpetitwilmerj', [row({ danubenet_name: 'Suarez Petit, Wilmer J', employee_number: 'E-300', start_date: '2026-01-01', end_date: null })]],
      ]);

      expect(service.resolveEmployeeNumber(index, 'Suarez Petit Wilmer J.', '2026-06-01')).toBe('E-300');
      expect(service.resolveEmployeeNumber(index, 'SUAREZ  PETIT,WILMER-J', '2026-06-01')).toBe('E-300');
    });

    it('reasignación: el mismo danubenet_name pasó de un empleado a otro en fechas no solapadas', () => {
      const index: DanubenetIndex = new Map([
        [
          'dnshared',
          [
            row({ danubenet_name: 'DN-SHARED', employee_number: 'E-OLD', start_date: '2025-01-01', end_date: '2026-01-31' }),
            row({ danubenet_name: 'DN-SHARED', employee_number: 'E-NEW', start_date: '2026-02-01', end_date: null }),
          ],
        ],
      ]);

      expect(service.resolveEmployeeNumber(index, 'DN-SHARED', '2025-06-15')).toBe('E-OLD');
      expect(service.resolveEmployeeNumber(index, 'DN-SHARED', '2026-06-15')).toBe('E-NEW');
    });

    it('end_date null = vigente indefinidamente, matchea fechas futuras', () => {
      const index: DanubenetIndex = new Map([
        ['dnopen', [row({ danubenet_name: 'DN-OPEN', employee_number: 'E-200', start_date: '2026-01-01', end_date: null })]],
      ]);

      expect(service.resolveEmployeeNumber(index, 'DN-OPEN', '2099-12-31')).toBe('E-200');
    });

    it('fecha fuera de cualquier tramo → null (sin match, sin fallback)', () => {
      const index: DanubenetIndex = new Map([
        ['dna', [row({ danubenet_name: 'DN-A', employee_number: 'E-100', start_date: '2026-08-01', end_date: '2026-08-15' })]],
      ]);

      expect(service.resolveEmployeeNumber(index, 'DN-A', '2026-08-16')).toBeNull();
    });

    it('nombre que no existe en el índice → null', () => {
      const index: DanubenetIndex = new Map();
      expect(service.resolveEmployeeNumber(index, 'DN-INEXISTENTE', '2026-08-10')).toBeNull();
    });

    it('sin fecha o sin nombre → null', () => {
      const index: DanubenetIndex = new Map([
        ['dna', [row({ danubenet_name: 'DN-A', employee_number: 'E-100', start_date: '2026-08-01', end_date: null })]],
      ]);

      expect(service.resolveEmployeeNumber(index, 'DN-A', '')).toBeNull();
      expect(service.resolveEmployeeNumber(index, '', '2026-08-10')).toBeNull();
    });
  });
});

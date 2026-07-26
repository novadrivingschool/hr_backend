import { EmployeesService } from './employees.service';

/**
 * Pruebas de findByFullNameStrict.
 * Cubre la regresión donde "N/A" tokenizaba a ['n','a'] y el fuzzy matching
 * de 1 edición lo emparejaba con iniciales de empleados reales (bug "Jemille").
 */
describe('EmployeesService.findByFullNameStrict', () => {
  const candidates = [
    { name: 'Jemille Adrienne M.', last_name: 'Amasol', employee_number: 'E-001' },
    { name: 'Viviana', last_name: 'Albarracin', employee_number: 'E-002' },
    { name: 'Ruth', last_name: 'Viera', employee_number: 'E-003' },
  ];

  let qb: any;
  let repo: any;
  let service: EmployeesService;

  beforeEach(() => {
    qb = {
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue(candidates),
    };
    repo = { createQueryBuilder: jest.fn(() => qb) };
    service = new EmployeesService(repo);
  });

  it('devuelve null para "N/A" sin siquiera consultar la DB', async () => {
    await expect(service.findByFullNameStrict('N/A')).resolves.toBeNull();
    expect(repo.createQueryBuilder).not.toHaveBeenCalled();
  });

  it('devuelve null para variantes degeneradas ("-", "S/N", "N A", "n.a.")', async () => {
    await expect(service.findByFullNameStrict('-')).resolves.toBeNull();
    await expect(service.findByFullNameStrict('S/N')).resolves.toBeNull();
    await expect(service.findByFullNameStrict('N A')).resolves.toBeNull();
    await expect(service.findByFullNameStrict('n.a.')).resolves.toBeNull();
    expect(repo.createQueryBuilder).not.toHaveBeenCalled();
  });

  it('devuelve null para una sola palabra (nombres de oficina)', async () => {
    await expect(service.findByFullNameStrict('NORRIDGE')).resolves.toBeNull();
    await expect(service.findByFullNameStrict('WESTERN')).resolves.toBeNull();
  });

  it('no devuelve a Jemille para "N/A" (regresión)', async () => {
    const r = await service.findByFullNameStrict('N/A');
    expect(r).toBeNull();
  });

  it('match exacto por nombre y apellido', async () => {
    const r = await service.findByFullNameStrict('Jemille Amasol');
    expect(r?.employee_number).toBe('E-001');
  });

  it('tolera 1 typo en tokens de 3+ caracteres', async () => {
    const r = await service.findByFullNameStrict('Jemile Amasol'); // falta una "l"
    expect(r?.employee_number).toBe('E-001');
  });

  it('la inicial del query se descarta y no afecta el match', async () => {
    const r = await service.findByFullNameStrict('Jemille Adrienne M. Amasol');
    expect(r?.employee_number).toBe('E-001');
  });

  it('no confunde empleados distintos', async () => {
    const r = await service.findByFullNameStrict('Ruth Viera');
    expect(r?.employee_number).toBe('E-003');
  });

  it('devuelve null cuando ningún candidato cubre todos los tokens', async () => {
    const r = await service.findByFullNameStrict('Persona Inexistente');
    expect(r).toBeNull();
  });
});

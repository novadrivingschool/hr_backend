import { Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as moment from 'moment-timezone';
import { Logger } from '@nestjs/common';
import axios from 'axios';

import { CreateICareDto } from './dto/create-i-care.dto';
import { UpdateICareDto } from './dto/update-i-care.dto';
import { CommitICareDto } from './dto/commit-i-care.dto';
import { JustifyICareDto } from './dto/justify-i-care.dto';
import { ResolveICareDto } from './dto/resolve-i-care.dto';
import { ICare, ICareStatus, ICareUrgency } from './entities/i-care.entity';
import { Employee } from '../employees/entities/employee.entity'; // ajusta el path si es necesario

// ── Types ──────────────────────────────────────────────────────────────────────

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  pageCount: number;
}

/**
 * Eventos de email disponibles en el flujo de un iCare.
 * Cada evento mapea a un endpoint del email service:
 *   POST /mailer-send/i-care/:id/:event  →  body: { recipients: string[] }
 *
 * Matriz de destinatarios por evento:
 *   created   → role 'hr'
 *   justified → staff_name + responsible[] + role 'management'
 *   committed → role 'hr' + responsible[] + role 'management'
 *   resolved  → staff_name + responsible[] + role 'management'
 */
type ICareEmailEvent = 'created' | 'justified' | 'committed' | 'resolved';

// ── Service ────────────────────────────────────────────────────────────────────

@Injectable()
export class ICareService {
  private readonly logger = new Logger(ICareService.name);

  constructor(
    @InjectRepository(ICare)
    private readonly iCareRepository: Repository<ICare>,

    @InjectRepository(Employee)
    private readonly employeeRepository: Repository<Employee>,
  ) { }

  // ── Email helpers ──────────────────────────────────────────────────────────

  /**
   * Obtiene los nova_email de todos los empleados activos con un rol dado.
   * Se usa internamente en cada trigger para resolver destinatarios,
   * y también se expone como endpoint auxiliar GET /i-care/emails-by-role/:role.
   *
   * @param role - 'hr' | 'management'
   * @returns    - Array de nova_email (sin nulls ni vacíos)
   */
  async getEmailsByRole(role: 'hr' | 'management'): Promise<string[]> {
    console.log(`[getEmailsByRole] 🔍 Iniciando búsqueda de correos para el rol: '${role}'`);

    try {
      const rawResults = await this.employeeRepository
        .createQueryBuilder('emp')
        // Limpiamos los espacios y pasamos a minúsculas para evitar duplicados por formato
        .select('DISTINCT LOWER(TRIM(emp.nova_email))', 'email')
        .where('emp.status = :status', { status: 'Active' })
        .andWhere("NULLIF(TRIM(emp.nova_email), '') IS NOT NULL")
        // Búsqueda en el array JSONB
        .andWhere('emp.roles::jsonb @> :roleParam::jsonb', { roleParam: JSON.stringify([role]) })
        .getRawMany<{ email: string }>();

      const emails = rawResults.map(r => r.email);

      if (emails.length === 0) {
        console.log(`[getEmailsByRole] ⚠️ No se encontró ningún correo activo para el rol '${role}'.`);
      } else {
        console.log(`[getEmailsByRole] ✅ Se encontraron ${emails.length} correos para '${role}':`, emails);
      }

      return emails;

    } catch (error) {
      // Capturamos cualquier error de sintaxis SQL, conexión caída, etc.
      console.error(`[getEmailsByRole] ❌ Error fatal al consultar correos para el rol '${role}':`);
      console.error(`Detalle del error:`, error?.message || error);

      // Lanzamos la excepción para que el método que llamó a esta función (ej. tu triggerEmail) 
      // se entere de que falló y pueda manejarlo o abortar el proceso, en lugar de fallar silenciosamente.
      throw new InternalServerErrorException(`Fallo al obtener los correos del rol ${role}`);
    }
  }

  /**
   * Dispara el email al servicio externo con la lista de destinatarios ya resuelta.
   * El email service recibe el id del iCare, el evento y los recipients en el body,
   * por lo que no necesita hacer consultas adicionales para saber a quiénes enviar.
   *
   * @param id         - UUID del iCare
   * @param event      - Evento del flujo: created | justified | committed | resolved
   * @param recipients - Lista de nova_email ya resuelta en este servicio
   */
  private async triggerEmail(
    id: string,
    event: ICareEmailEvent,
    recipients: string[],
  ): Promise<void> {
    // 1. Log inicial para ver qué recibe el método
    this.logger.log(`[triggerEmail] Iniciando envío para iCare ID: ${id} | Evento: ${event}`);
    this.logger.log(`[triggerEmail] Destinatarios recibidos (${recipients?.length || 0}):`, recipients);

    if (!id) {
      this.logger.warn(`[triggerEmail] ⚠️ Se canceló el envío: No se proporcionó un ID.`);
      return;
    }

    const base = process.env.EMAIL_SERVICE_BASE;
    if (!base) {
      this.logger.error('❌ EMAIL_SERVICE_BASE is not configured');
      return;
    }

    if (!recipients || !recipients.length) {
      this.logger.warn(`⚠️ No recipients resolved for event '${event}' on iCare id=${id}`);
      return;
    }

    const url = `${base}/mailer-send/i-care/${id}/${event}`;
    const payload = { recipients };

    // 2. Log justo antes de disparar la petición HTTP
    this.logger.log(`[triggerEmail] 🚀 Disparando POST a: ${url}`);
    this.logger.log(`[triggerEmail] 📦 Payload enviado:`, JSON.stringify(payload));

    try {
      // 3. Ejecutamos la petición
      const response = await axios.post(url, payload);

      // 4. Log de éxito con el status code que devolvió el microservicio
      this.logger.log(`[triggerEmail] ✅ Petición exitosa. Status Code: ${response.status}`);

    } catch (error) {
      // 5. Log detallado en caso de que el microservicio falle (ej. 404 Not Found, 500 Error, etc.)
      this.logger.error(`[triggerEmail] ❌ Error al comunicarse con el microservicio de correos:`);

      if (error.response) {
        // El servidor respondió con un status code fuera del rango 2xx
        this.logger.error(`Status: ${error.response.status}`);
        this.logger.error(`Data:`, JSON.stringify(error.response.data));
      } else if (error.request) {
        // La petición se hizo pero no hubo respuesta (ej. el servicio está caído)
        this.logger.error(`No hubo respuesta del servidor. ¿Está levantado el servicio en ${base}?`);
      } else {
        // Algo pasó al armar la petición
        this.logger.error(`Error Message: ${error.message}`);
      }
    }
  }

  /**
   * Trigger para el evento 'created'.
   * Destinatarios: todos los empleados activos con role 'hr'.
   *
   * @param id - UUID del iCare recién creado
   */
  private async triggerCreatedEmail(id: string): Promise<void> {
    const hrEmails = await this.getEmailsByRole('hr');
    await this.triggerEmail(id, 'created', hrEmails);
  }

  /**
   * Trigger para el evento 'justified'.
   * Destinatarios: staff_name + responsible[] + role 'management'.
   * Solo se llama cuando justified=true.
   *
   * @param id     - UUID del iCare
   * @param record - Registro completo del iCare (para extraer staff y coordinators)
   */
  private async triggerJustifiedEmail(id: string, record: ICare): Promise<void> {
    const managementEmails = await this.getEmailsByRole('management');
    const staffEmail = record.staff_name?.nova_email ?? null;
    const coordinatorEmails = (record.responsible ?? []).map(r => r.nova_email).filter(Boolean);

    const recipients = [
      ...new Set([
        ...(staffEmail ? [staffEmail] : []),
        ...coordinatorEmails,
        ...managementEmails,
      ]),
    ];

    await this.triggerEmail(id, 'justified', recipients);
  }

  /**
   * Trigger para el evento 'committed'.
   * Destinatarios: role 'hr' + responsible[] + role 'management'.
   * Solo se llama cuando committed=true.
   *
   * @param id     - UUID del iCare
   * @param record - Registro completo del iCare (para extraer coordinators)
   */
  private async triggerCommittedEmail(id: string, record: ICare): Promise<void> {
    const [hrEmails, managementEmails] = await Promise.all([
      this.getEmailsByRole('hr'),
      this.getEmailsByRole('management'),
    ]);
    const coordinatorEmails = (record.responsible ?? []).map(r => r.nova_email).filter(Boolean);

    const recipients = [
      ...new Set([
        ...hrEmails,
        ...coordinatorEmails,
        ...managementEmails,
      ]),
    ];

    await this.triggerEmail(id, 'committed', recipients);
  }

  /**
   * Trigger para el evento 'resolved'.
   * Destinatarios: staff_name + responsible[] + role 'management'.
   * Siempre se llama al resolver (no es opcional).
   *
   * @param id     - UUID del iCare
   * @param record - Registro completo del iCare (para extraer staff y coordinators)
   */
  private async triggerResolvedEmail(id: string, record: ICare): Promise<void> {
    const managementEmails = await this.getEmailsByRole('management');
    const staffEmail = record.staff_name?.nova_email ?? null;
    const coordinatorEmails = (record.responsible ?? []).map(r => r.nova_email).filter(Boolean);

    const recipients = [
      ...new Set([
        ...(staffEmail ? [staffEmail] : []),
        ...coordinatorEmails,
        ...managementEmails,
      ]),
    ];

    await this.triggerEmail(id, 'resolved', recipients);
  }

  // ── Create ─────────────────────────────────────────────────────────────────

  /**
   * Crea un nuevo registro iCare y notifica únicamente a HR.
   * El Staff NO es notificado en este momento — eso ocurre al justificar.
   *
   * @param createICareDto - Datos del nuevo iCare
   * @returns              - Registro creado
   */
  async create(createICareDto: CreateICareDto): Promise<ICare> {
    const record = this.iCareRepository.create(createICareDto);

    const saved = await this.iCareRepository.save(record);

    // Solo HR recibe notificación al momento de la creación
    this.triggerCreatedEmail(saved.id).catch((err) =>
      this.logger.error(
        `❌ Failed to trigger 'created' email for id=${saved.id}`,
        err?.message || err,
      ),
    );

    return saved;
  }

  // ── FindAll ────────────────────────────────────────────────────────────────

  /**
   * Retorna todos los registros iCare paginados, ordenados por fecha de creación DESC.
   *
   * @param page  - Número de página (default: 1)
   * @param limit - Registros por página (default: 15)
   * @returns     - Resultado paginado con metadata
   */
  async findAll(page = 1, limit = 15): Promise<PaginatedResult<ICare>> {
    try {
      this.logger.log(`Fetching all ICare records — page: ${page}, limit: ${limit}`);

      const [records, total] = await this.iCareRepository.findAndCount({
        order: { createdAt: 'DESC' },
        skip: (page - 1) * limit,
        take: limit,
      });

      return {
        data: this.transformDates(records),
        total,
        page,
        limit,
        pageCount: Math.ceil(total / limit),
      };
    } catch (error) {
      this.logger.error('Error fetching ICare records:', error);
      throw error;
    }
  }

  // ── FindOne ────────────────────────────────────────────────────────────────

  /**
   * Busca un único registro iCare por su UUID.
   * Lanza NotFoundException si no existe.
   *
   * @param id - UUID del iCare
   * @returns  - Registro encontrado con fechas transformadas al timezone de Chicago
   */
  async findOne(id: string): Promise<ICare> {
    try {
      const record = await this.iCareRepository.findOne({ where: { id } });
      if (!record) throw new NotFoundException(`ICare record with id ${id} not found`);
      return this.transformDates([record])[0];
    } catch (error) {
      this.logger.error(`Error fetching ICare record with ID: ${id}`, error);
      throw error;
    }
  }

  // ── Update ─────────────────────────────────────────────────────────────────

  /**
   * Actualiza campos generales de un iCare existente.
   * Para las acciones del flujo (justify, commit, resolve) usar sus métodos dedicados.
   *
   * @param id             - UUID del iCare
   * @param updateICareDto - Campos a actualizar (parcial)
   * @returns              - Registro actualizado
   */
  async update(id: string, updateICareDto: UpdateICareDto): Promise<ICare> {
    const existingRecord = await this.iCareRepository.findOne({ where: { id } });
    if (!existingRecord) throw new NotFoundException(`ICare record with ID ${id} not found`);

    const updatedRecord = {
      ...existingRecord,
      ...updateICareDto,
      date: updateICareDto.date ?? existingRecord.date,
      updatedAt: new Date(),
    };

    return await this.iCareRepository.save(updatedRecord);
  }

  // ── Remove ─────────────────────────────────────────────────────────────────

  /**
   * Elimina un registro iCare por su UUID.
   * Lanza NotFoundException si no existe.
   *
   * @param id - UUID del iCare a eliminar
   */
  async remove(id: string): Promise<void> {
    try {
      const record = await this.findOne(id);
      await this.iCareRepository.remove(record);
    } catch (error) {
      this.logger.error(`Error removing ICare record with ID: ${id}`, error);
      throw error;
    }
  }

  // ── FindByFilters ──────────────────────────────────────────────────────────

  /**
   * Busca registros iCare aplicando múltiples filtros opcionales con paginación.
   * Soporta filtrado por rango de fechas, empleados (submitter, staff, responsible),
   * urgency, status, committed y departamento (acepta múltiples separados por coma).
   *
   * @param filters - Objeto de filtros opcionales
   * @param page    - Número de página (default: 1)
   * @param limit   - Registros por página (default: 15)
   * @returns       - Resultado paginado con metadata
   */
  async findByFilters(
    filters: {
      dateFrom?: string;
      dateTo?: string;
      submitterEmployeeNumber?: string;
      staffEmployeeNumber?: string;
      responsibleEmployeeNumber?: string;
      urgency?: ICareUrgency;
      status?: ICareStatus;
      committed?: boolean;
      department?: string;
    },
    page = 1,
    limit = 15,
  ): Promise<PaginatedResult<ICare>> {
    try {
      this.logger.log(`Searching ICare records — page: ${page}, limit: ${limit}, filters: ${JSON.stringify(filters)}`);

      const query = this.iCareRepository.createQueryBuilder('icare');

      if (filters.dateFrom && filters.dateTo) {
        query.andWhere('icare.date BETWEEN :dateFrom AND :dateTo', {
          dateFrom: filters.dateFrom,
          dateTo: filters.dateTo,
        });
      }

      if (filters.submitterEmployeeNumber) {
        query.andWhere(
          `TRIM(icare.submitter->>'employee_number') = TRIM(:submitterEmpNum)`,
          { submitterEmpNum: filters.submitterEmployeeNumber },
        );
      }

      if (filters.staffEmployeeNumber) {
        query.andWhere(
          `TRIM(icare.staff_name->>'employee_number') = TRIM(:staffEmpNum)`,
          { staffEmpNum: filters.staffEmployeeNumber },
        );
      }

      if (filters.responsibleEmployeeNumber) {
        query.andWhere(`icare.responsible::jsonb @> :respQuery`, {
          respQuery: JSON.stringify([{ employee_number: filters.responsibleEmployeeNumber }]),
        });
      }

      if (filters.urgency) {
        query.andWhere('icare.urgency = :urgency', { urgency: filters.urgency });
      }

      if (filters.status) {
        query.andWhere('icare.status = :status', { status: filters.status });
      }

      if (filters.committed !== undefined) {
        query.andWhere('icare.committed = :committed', { committed: filters.committed });
      }

      if (filters.department) {
        const depts = filters.department.split(',').map(d => d.trim()).filter(Boolean);
        if (depts.length === 1) {
          query.andWhere('icare.department ILIKE :dept0', { dept0: `%${depts[0]}%` });
        } else {
          const conditions = depts.map((_, i) => `icare.department ILIKE :dept${i}`);
          const params: Record<string, string> = {};
          depts.forEach((d, i) => { params[`dept${i}`] = `%${d}%`; });
          query.andWhere(`(${conditions.join(' OR ')})`, params);
        }
      }

      query.orderBy('icare.createdAt', 'DESC').skip((page - 1) * limit).take(limit);

      const [records, total] = await query.getManyAndCount();

      return {
        data: this.transformDates(records),
        total,
        page,
        limit,
        pageCount: Math.ceil(total / limit),
      };
    } catch (error) {
      this.logger.error('Error searching ICare records:', error);
      throw error;
    }
  }

  // ── FindByCurrentSubmitter ─────────────────────────────────────────────────

  /**
   * Retorna todos los iCare levantados por un empleado específico (submitter),
   * identificado por su employee_number. Ordenados por fecha de creación DESC.
   *
   * @param employeeNumber - Número de empleado del submitter
   * @returns              - Lista de registrosF
   */
  async findByCurrentSubmitter(
    employeeNumber: string,
    page = 1,
    limit = 15,
  ): Promise<{ data: ICare[]; total: number; page: number; limit: number; pageCount: number }> {
    try {
      const skip = (page - 1) * limit;

      const [records, total] = await this.iCareRepository
        .createQueryBuilder('icare')
        .where(`TRIM(icare.submitter->>'employee_number') = TRIM(:employeeNumber)`, {
          employeeNumber: employeeNumber.trim(),
        })
        .orderBy('icare.createdAt', 'DESC')
        .skip(skip)
        .take(limit)
        .getManyAndCount();

      return {
        data: this.transformDates(records),
        total,
        page,
        limit,
        pageCount: Math.ceil(total / limit),
      };
    } catch (error) {
      this.logger.error(`Error fetching ICare records by submitter: ${employeeNumber}`, error);
      throw error;
    }
  }

  // ── FindByStaff ────────────────────────────────────────────────────────────

  /**
   * Retorna todos los iCare asignados a un empleado de staff específico,
   * identificado por su employee_number. Ordenados por fecha de creación DESC.
   *
   * @param employeeNumber - Número de empleado del staff
   * @returns              - Lista de registros
   */
  async findByStaff(employeeNumber: string): Promise<ICare[]> {
    try {
      const records = await this.iCareRepository.find({
        where: { staff_name: { employee_number: employeeNumber } },
        order: { createdAt: 'DESC' },
      });
      return this.transformDates(records);
    } catch (error) {
      this.logger.error('Error fetching ICare records by staff:', error);
      throw error;
    }
  }

  // ── GetStats ───────────────────────────────────────────────────────────────

  /**
   * Calcula estadísticas agregadas del módulo iCare con filtros opcionales.
   * Incluye: totales, distribución por urgency, distribución por status,
   * conteos de committed/pending, críticos activos y tendencia mensual (6 meses).
   *
   * @param filters - Filtros opcionales (fechas, empleados, urgency, status, department)
   * @returns       - Objeto con todas las métricas calculadas
   */
  async getStats(filters: {
    dateFrom?: string;
    dateTo?: string;
    submitterEmployeeNumber?: string;
    staffEmployeeNumber?: string;
    urgency?: ICareUrgency;
    status?: ICareStatus;
    department?: string;
  } = {}): Promise<any> {
    try {
      this.logger.log(`Fetching ICare statistics with filters: ${JSON.stringify(filters)}`);

      // ── Helper: aplica filtro de departamento a cualquier QueryBuilder ────────
      const applyDeptFilter = (qb: any) => {
        if (!filters.department) return qb;
        const depts = filters.department.split(',').map(d => d.trim()).filter(Boolean);
        if (depts.length === 1) {
          qb.andWhere('icare.department ILIKE :dept0', { dept0: `%${depts[0]}%` });
        } else {
          const conditions = depts.map((_, i) => `icare.department ILIKE :dept${i}`);
          const params: Record<string, string> = {};
          depts.forEach((d, i) => { params[`dept${i}`] = `%${d}%`; });
          qb.andWhere(`(${conditions.join(' OR ')})`, params);
        }
        return qb;
      };

      // ── Helper: aplica filtros base comunes a cualquier QueryBuilder ──────────
      const applyBaseFilters = (qb: any) => {
        if (filters.dateFrom && filters.dateTo) {
          qb.andWhere('icare.date BETWEEN :dateFrom AND :dateTo', {
            dateFrom: filters.dateFrom,
            dateTo: filters.dateTo,
          });
        }
        if (filters.submitterEmployeeNumber) {
          qb.andWhere(`icare.submitter->>'employee_number' = :submitterEmpNum`, {
            submitterEmpNum: filters.submitterEmployeeNumber,
          });
        }
        if (filters.staffEmployeeNumber) {
          qb.andWhere(`icare.staff_name->>'employee_number' = :staffEmpNum`, {
            staffEmpNum: filters.staffEmployeeNumber,
          });
        }
        if (filters.urgency) {
          qb.andWhere('icare.urgency = :urgency', { urgency: filters.urgency });
        }
        if (filters.status) {
          qb.andWhere('icare.status = :status', { status: filters.status });
        }
        applyDeptFilter(qb);
        return qb;
      };

      // ── totalRecords ──────────────────────────────────────────────────────────
      const baseQuery = this.iCareRepository.createQueryBuilder('icare');
      applyBaseFilters(baseQuery);
      const totalRecords = await baseQuery.getCount();

      // ── urgencyDistribution ───────────────────────────────────────────────────
      const urgencyQb = this.iCareRepository
        .createQueryBuilder('icare')
        .select('icare.urgency', 'urgency')
        .addSelect('COUNT(*)', 'count')
        .groupBy('icare.urgency');
      applyBaseFilters(urgencyQb);
      const urgencyDistribution = await urgencyQb.getRawMany();

      const urgencyMap = Object.fromEntries(
        urgencyDistribution.map(r => [r.urgency, parseInt(r.count, 10)]),
      );
      const lowCount = urgencyMap[ICareUrgency.LOW] || 0;
      const mediumCount = urgencyMap[ICareUrgency.MEDIUM] || 0;
      const highCount = urgencyMap[ICareUrgency.HIGH] || 0;
      const criticalCount = urgencyMap[ICareUrgency.CRITICAL] || 0;

      // ── statusDistribution ────────────────────────────────────────────────────
      const statusQb = this.iCareRepository
        .createQueryBuilder('icare')
        .select('icare.status', 'status')
        .addSelect('COUNT(*)', 'count')
        .groupBy('icare.status');
      applyBaseFilters(statusQb);
      const statusDistribution = await statusQb.getRawMany();

      const statusMap = Object.fromEntries(
        statusDistribution.map(r => [r.status, parseInt(r.count, 10)]),
      );
      const pendingStatusCount = statusMap[ICareStatus.PENDING] || 0;
      const inProgressStatusCount = statusMap[ICareStatus.IN_PROGRESS] || 0;
      const solvedStatusCount = statusMap[ICareStatus.SOLVED] || 0;

      // ── monthlyTrend (últimos 6 meses) ────────────────────────────────────────
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

      const trendQb = this.iCareRepository
        .createQueryBuilder('icare')
        .select(`DATE_TRUNC('month', icare.createdAt)`, 'month')
        .addSelect('COUNT(*)', 'count')
        .where('icare.createdAt >= :sixMonthsAgo', { sixMonthsAgo })
        .groupBy(`DATE_TRUNC('month', icare.createdAt)`)
        .orderBy('month', 'DESC');
      applyDeptFilter(trendQb);
      const monthlyTrend = await trendQb.getRawMany();

      // ── committedCount / pendingCount ─────────────────────────────────────────
      const committedQb = this.iCareRepository
        .createQueryBuilder('icare')
        .where('icare.committed = :c', { c: true });
      applyBaseFilters(committedQb);
      const committedCount = await committedQb.getCount();

      const pendingCommitQb = this.iCareRepository
        .createQueryBuilder('icare')
        .where('icare.committed = :c', { c: false });
      applyBaseFilters(pendingCommitQb);
      const pendingCount = await pendingCommitQb.getCount();

      // ── criticalActiveCount: High o Critical sin status SOLVED ────────────────
      const criticalActiveQb = this.iCareRepository
        .createQueryBuilder('icare')
        .where('icare.urgency IN (:...urgencies)', {
          urgencies: [ICareUrgency.HIGH, ICareUrgency.CRITICAL],
        });
      if (filters.status) {
        criticalActiveQb.andWhere('icare.status = :status', { status: filters.status });
      } else {
        criticalActiveQb.andWhere('icare.status != :solved', { solved: ICareStatus.SOLVED });
      }
      applyDeptFilter(criticalActiveQb);
      const criticalActiveCount = await criticalActiveQb.getCount();

      return {
        // totales
        totalRecords,
        committedCount,
        pendingCount,
        // por urgency
        lowCount,
        mediumCount,
        highCount,
        criticalCount,
        criticalActiveCount,
        urgencyDistribution,
        // por status
        pendingStatusCount,
        inProgressStatusCount,
        solvedStatusCount,
        statusDistribution,
        // tendencia
        monthlyTrend,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error('Error fetching ICare statistics:', error);
      throw error;
    }
  }

  // ── Justify ────────────────────────────────────────────────────────────────

  /**
   * HR marca un iCare como justificado (o no justificado).
   * Si justified=true:
   *   - Avanza el status a IN_PROGRESS
   *   - Registra quién aprobó, fecha y hora (America/Chicago)
   *   - Agrega el comment al array justified_comments (si viene)
   *   - Dispara email a: staff_name + responsible[] + role 'management'
   * Si justified=false: solo guarda el rechazo sin cambiar status ni enviar emails.
   *
   * @param id  - UUID del iCare
   * @param dto - { justified, approved_by, comment? }
   * @returns   - Registro actualizado
   */
  async justify(id: string, dto: JustifyICareDto): Promise<ICare> {
    const record = await this.iCareRepository.findOne({ where: { id } });
    if (!record) throw new NotFoundException(`ICare record with id ${id} not found`);

    const now = moment().tz('America/Chicago');

    record.justified = dto.justified;
    record.justified_approved_by = dto.approved_by;
    record.justified_date = now.format('YYYY-MM-DD');
    record.justified_time = now.format('HH:mm');

    if (dto.comment) {
      record.justified_comments = [
        ...(record.justified_comments ?? []),
        dto.comment,
      ];
    }

    if (dto.justified) {
      record.status = ICareStatus.IN_PROGRESS;
    }

    const saved = await this.iCareRepository.save(record);

    // Notificar a Staff + Coordinator (responsible) + Management solo si fue justificado
    if (dto.justified) {
      this.triggerJustifiedEmail(saved.id, saved).catch((err) =>
        this.logger.error(
          `❌ Failed to trigger 'justified' email for id=${saved.id}`,
          err?.message || err,
        ),
      );
    }

    return this.transformDates([saved])[0];
  }

  // ── Commit ─────────────────────────────────────────────────────────────────

  /**
   * El Staff registra su compromiso (commit) sobre el iCare.
   * Si committed=true:
   *   - Guarda fecha, hora (America/Chicago si no se proveen) y notas del commit
   *   - Dispara email a: role 'hr' + responsible[] + role 'management'
   * Si committed=false: limpia todos los campos de commit sin enviar emails.
   *
   * @param id  - UUID del iCare
   * @param dto - { committed, committed_date?, committed_time?, committed_notes? }
   * @returns   - Registro actualizado
   */
  async commit(id: string, dto: CommitICareDto): Promise<ICare> {
    const record = await this.iCareRepository.findOne({ where: { id } });
    if (!record) throw new NotFoundException(`ICare record with id ${id} not found`);

    const now = moment().tz('America/Chicago');
    record.committed = dto.committed;

    if (dto.committed) {
      record.committed_date = dto.committed_date ?? now.format('YYYY-MM-DD');
      record.committed_time = dto.committed_time ?? now.format('HH:mm');
      record.committed_notes = dto.committed_notes ?? record.committed_notes ?? null;
      // NUEVO: Guardar los attachments si vienen en el payload
      if (dto.committed_attachments) {
        record.committed_attachments = dto.committed_attachments;
      }
    } else {
      record.committed_date = null;
      record.committed_time = null;
      record.committed_notes = null;
      record.committed_attachments = []; // Limpiar si se des-compromete
    }

    const saved = await this.iCareRepository.save(record);

    // Notificar a HR + Coordinator (responsible) + Management cuando el Staff hace commit
    if (dto.committed) {
      this.triggerCommittedEmail(saved.id, saved).catch((err) =>
        this.logger.error(
          `❌ Failed to trigger 'committed' email for id=${saved.id}`,
          err?.message || err,
        ),
      );
    }

    return this.transformDates([saved])[0];
  }

  // ── Resolve ────────────────────────────────────────────────────────────────

  /**
   * HR marca el iCare como resuelto (SOLVED).
   * Registra quién lo resolvió, fecha, hora (America/Chicago) y notas opcionales.
   * Siempre dispara email a: staff_name + responsible[] + role 'management'.
   *
   * @param id  - UUID del iCare
   * @param dto - { resolved_by, resolved_notes? }
   * @returns   - Registro actualizado con status SOLVED
   */
  async resolve(id: string, dto: ResolveICareDto): Promise<ICare> {
    const record = await this.iCareRepository.findOne({ where: { id } });
    if (!record) throw new NotFoundException(`ICare record with id ${id} not found`);

    const now = moment().tz('America/Chicago');

    record.status = ICareStatus.SOLVED;
    record.resolved_by = dto.resolved_by;
    record.resolved_date = now.format('YYYY-MM-DD');
    record.resolved_time = now.format('HH:mm');
    record.resolved_notes = dto.resolved_notes ?? null;

    const saved = await this.iCareRepository.save(record);

    // Notificar a Staff + Coordinator (responsible) + Management al resolver
    this.triggerResolvedEmail(saved.id, saved).catch((err) =>
      this.logger.error(
        `❌ Failed to trigger 'resolved' email for id=${saved.id}`,
        err?.message || err,
      ),
    );

    return this.transformDates([saved])[0];
  }

  // ── Search ─────────────────────────────────────────────────────────────────

  /**
   * Búsqueda full-text sobre múltiples campos del iCare:
   * reason, details, nombre/apellido/employee_number del submitter y del staff.
   * Requiere mínimo 2 caracteres en el query (validado en el controller).
   *
   * @param queryStr - Texto a buscar (mínimo 2 caracteres)
   * @param filters  - Filtros opcionales de fechas y urgency
   * @returns        - Lista de registros que coinciden, ordenados por createdAt DESC
   */
  async search(
    queryStr: string,
    filters: { dateFrom?: string; dateTo?: string; urgency?: ICareUrgency } = {},
  ): Promise<ICare[]> {
    try {
      const searchQuery = this.iCareRepository
        .createQueryBuilder('icare')
        .where(
          `(
            icare.reason ILIKE :q OR
            icare.details ILIKE :q OR
            icare.submitter->>'name' ILIKE :q OR
            icare.submitter->>'last_name' ILIKE :q OR
            icare.submitter->>'employee_number' ILIKE :q OR
            icare.staff_name->>'name' ILIKE :q OR
            icare.staff_name->>'last_name' ILIKE :q OR
            icare.staff_name->>'employee_number' ILIKE :q
          )`,
          { q: `%${queryStr}%` },
        );

      if (filters.dateFrom && filters.dateTo) {
        searchQuery.andWhere('icare.date BETWEEN :dateFrom AND :dateTo', {
          dateFrom: filters.dateFrom,
          dateTo: filters.dateTo,
        });
      }

      if (filters.urgency) {
        searchQuery.andWhere('icare.urgency = :urgency', { urgency: filters.urgency });
      }

      const records = await searchQuery.orderBy('icare.createdAt', 'DESC').getMany();
      return this.transformDates(records);
    } catch (error) {
      this.logger.error('Error in full-text search:', error);
      throw error;
    }
  }

  // ── Batch operations ───────────────────────────────────────────────────────

  /**
   * Actualiza en bulk múltiples registros iCare por sus UUIDs.
   * Aplica los mismos campos a todos los registros del array ids.
   *
   * @param ids     - Array de UUIDs a actualizar
   * @param updates - Campos a actualizar (parcial)
   * @returns       - { updated: number } con la cantidad de registros afectados
   */
  async batchUpdate(ids: string[], updates: UpdateICareDto): Promise<{ updated: number }> {
    try {
      const result = await this.iCareRepository
        .createQueryBuilder()
        .update(ICare)
        .set(updates)
        .where('id IN (:...ids)', { ids })
        .execute();
      return { updated: result.affected || 0 };
    } catch (error) {
      this.logger.error('Error in batch update:', error);
      throw error;
    }
  }

  /**
   * Elimina en bulk múltiples registros iCare por sus UUIDs.
   *
   * @param ids - Array de UUIDs a eliminar
   * @returns   - { deleted: number } con la cantidad de registros eliminados
   */
  async batchDelete(ids: string[]): Promise<{ deleted: number }> {
    try {
      const result = await this.iCareRepository
        .createQueryBuilder()
        .delete()
        .from(ICare)
        .where('id IN (:...ids)', { ids })
        .execute();
      return { deleted: result.affected || 0 };
    } catch (error) {
      this.logger.error('Error in batch delete:', error);
      throw error;
    }
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  /**
   * Transforma las fechas createdAt y updatedAt de los registros
   * al timezone America/Chicago en formato 'YYYY-MM-DD HH:mm:ss'.
   *
   * @param records - Array de registros ICare
   * @returns       - Mismos registros con fechas transformadas
   */
  private transformDates(records: ICare[]): ICare[] {
    return records.map(record => ({
      ...record,
      createdAt: moment(record.createdAt)
        .tz('America/Chicago')
        .format('YYYY-MM-DD HH:mm:ss') as any,
      updatedAt: moment(record.updatedAt)
        .tz('America/Chicago')
        .format('YYYY-MM-DD HH:mm:ss') as any,
    }));
  }
}
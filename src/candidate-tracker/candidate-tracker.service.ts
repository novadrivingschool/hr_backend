import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { CandidateTracker } from './entities/candidate-tracker.entity';
import {
  CandidateTrackerStatusHistory,
  CandidateTrackerHistoryField,
} from './entities/candidate-tracker-status-history.entity';
import { CreateCandidateTrackerDto } from './dto/create-candidate-tracker.dto';
import { UpdateCandidateTrackerDto } from './dto/update-candidate-tracker.dto';
import { QueryCandidateTrackerDto } from './dto/query-candidate-tracker.dto';
import { QueryCandidateTrackerHistoryDto } from './dto/query-candidate-tracker-history.dto';
import { QueryWeeklyKpisDto } from './dto/query-weekly-kpis.dto';
import { CandidateStatusEnum, ContactAttemptEnum } from './enums';
import { HrUser } from '../common/current-user';
import { deleteCandidateTrackerS3File } from '../common/aws-services.client';

/**
 * Campos que CandidateTrackerService audita en candidate_tracker_status_history
 * (ver esa entidad para el detalle). Unica lista central: agregar un campo
 * aca es lo unico que hace falta para que create()/update() empiecen a
 * loguearlo -- asi no se repite el problema de "nos olvidamos de trackear
 * contactAttempt" que paso antes de esta generalizacion (2026-09-22).
 */
const TRACKED_FIELDS: CandidateTrackerHistoryField[] = [
  'status', 'result', 'inPersonInterviewResult', 'inPersonInterviewNotes', 'finalResult',
  'contactAttempt', 'recruiter', 'department', 'source',
  'position', 'location', 'typeOfStaff', 'employmentType', 'interviewType',
  'englishInterview', 'phoneNumber', 'email', 'interviewScheduledAt',
  'interviewCompletedAt', 'observations', 'interviewFeedback',
  'contactAttemptNotes',
  // Checklist de Screening -- iban sin trackear desde el arranque del
  // modulo (bug encontrado 2026-09-22 al revisar el log generalizado: la
  // regla es "absolutamente todo", esto se habia quedado afuera); se
  // agregan aca junto con los 6 items nuevos que pidio Javier.
  'driversLicense', 'englishTestPassed', 'personalityTestPassed',
  'typingTestPassed', 'ageVerified', 'diplomaTranscript', 'twentyOnePlus',
  'backgroundCheckPassed', 'psychometricTestPassed', 'noAtFaultAccident',
];

/**
 * Zona horaria en la que HR "piensa" las fechas (Nova opera desde Chicago).
 * createdAt/changedAt son instantes (timestamptz, UTC en la base): un
 * filtro "hasta el 28 de feb" tiene que significar 28-feb 23:59:59 HORA DE
 * CHICAGO, no UTC -- si no, un cambio de status a las 10pm del 28 queda
 * guardado como 1-mar 04:00Z y se cae del filtro. Por eso todos los rangos
 * de fecha sobre instantes se convierten con `AT TIME ZONE` en SQL, y la
 * semana de los KPIs se calcula en esta zona (no en la del proceso Node ni
 * en la sesion de Postgres, que suelen ser UTC). Las fechas de entrevista
 * NO pasan por aqui: son columnas `date` puras (calendario, sin hora).
 */
const BUSINESS_TIMEZONE = 'America/Chicago';

/** YYYY-MM-DD de un Date usando sus componentes UTC -- para la aritmetica
 * de calendario de getWeeklyKpis, que se hace en UTC a proposito para que
 * no dependa del TZ del proceso. */
function toDateOnlyUTC(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

@Injectable()
export class CandidateTrackerService {
  private readonly logger = new Logger(CandidateTrackerService.name);

  constructor(
    @InjectRepository(CandidateTracker)
    private readonly repo: Repository<CandidateTracker>,
    @InjectRepository(CandidateTrackerStatusHistory)
    private readonly historyRepo: Repository<CandidateTrackerStatusHistory>,
  ) {}

  async create(dto: CreateCandidateTrackerDto): Promise<CandidateTracker> {
    const entity = this.repo.create({
      ...dto,
      candidateName: dto.candidateName.trim(),
      status: dto.status ?? CandidateStatusEnum.ToContact,
      attachments: [],
    });
    // Solo se toca si vino en el body: si el caller no manda el campo, se
    // deja que la columna use su default de BD ("+1") en vez de forzar null.
    if (dto.phoneCountryCode !== undefined) {
      entity.phoneCountryCode = this.normalizeCountryCode(dto.phoneCountryCode);
    }
    if (dto.interviewScheduledAt !== undefined) {
      entity.interviewScheduledAt = this.normalizeDateOnly(dto.interviewScheduledAt);
    }
    if (dto.interviewCompletedAt !== undefined) {
      entity.interviewCompletedAt = this.normalizeDateOnly(dto.interviewCompletedAt);
    }
    const saved = await this.repo.save(entity);

    // Historial: todo candidato arranca con un estado (status siempre tiene
    // valor por el default de la entidad), y cualquier otro campo trackeado
    // que ya haya venido seteado desde la creacion (result, recruiter,
    // department, etc.) tambien queda logueado desde el arranque.
    for (const field of TRACKED_FIELDS) {
      const raw = (saved as any)[field];
      // Un checkbox de Screening sin marcar (false = default de la columna)
      // no es un "valor inicial" que valga la pena loguear: sin esto, cada
      // candidato nuevo arrancaria con 10 entradas "No" en el timeline de
      // Actividad. En update() si se loguea false<->true, porque ahi es
      // un cambio real.
      if (raw === false) continue;
      const value = this.stringifyFieldValue(raw);
      if (value !== null) {
        await this.logHistoryChange(
          saved.id,
          field,
          null,
          value,
          saved.createdByEmployeeNumber ?? null,
          saved.createdByName ?? null,
        );
      }
    }

    return saved;
  }

  async findAll(q: QueryCandidateTrackerDto) {
    const page = Math.max(1, q.page ?? 1);
    const limit = Math.max(1, Math.min(100, q.limit ?? 25));

    const qb = this.repo.createQueryBuilder('ct');
    qb.andWhere('ct.deletedAt IS NULL');

    if (q.search?.trim()) {
      qb.andWhere(
        '(LOWER(ct.candidateName) LIKE :s OR LOWER(ct.email) LIKE :s OR ct.phoneNumber LIKE :s OR LOWER(ct.position) LIKE :s)',
        { s: `%${q.search.trim().toLowerCase()}%` },
      );
    }
    // Si viene un rango de fecha de cambio de status/result, ese reemplaza
    // al filtro de "valor actual" de mas abajo -- ver findCandidateIdsByHistoryDateRange.
    if (q.statusDateFrom || q.statusDateTo) {
      const ids = await this.findCandidateIdsByHistoryDateRange('status', q.status, q.statusDateFrom, q.statusDateTo);
      qb.andWhere(ids.length ? 'ct.id IN (:...statusHistoryIds)' : '1=0', { statusHistoryIds: ids });
    } else if (q.status) {
      qb.andWhere('ct.status = :status', { status: q.status });
    }
    if (q.resultDateFrom || q.resultDateTo) {
      const ids = await this.findCandidateIdsByHistoryDateRange('result', q.result, q.resultDateFrom, q.resultDateTo);
      qb.andWhere(ids.length ? 'ct.id IN (:...resultHistoryIds)' : '1=0', { resultHistoryIds: ids });
    } else if (q.result) {
      qb.andWhere('ct.result = :result', { result: q.result });
    }
    if (q.finalResult) qb.andWhere('ct.finalResult = :finalResult', { finalResult: q.finalResult });
    if (q.source) qb.andWhere('ct.source = :source', { source: q.source });
    if (q.recruiter?.trim()) {
      qb.andWhere('LOWER(ct.recruiter) = :recruiter', { recruiter: q.recruiter.trim().toLowerCase() });
    }
    if (q.department?.trim()) {
      qb.andWhere('LOWER(ct.department) = :department', { department: q.department.trim().toLowerCase() });
    }
    // createdAt es un instante: el dia elegido se interpreta en hora de
    // Chicago (ver BUSINESS_TIMEZONE).
    if (q.dateFrom) {
      qb.andWhere('ct.createdAt >= (CAST(:dateFrom AS timestamp) AT TIME ZONE :tz)', {
        dateFrom: `${q.dateFrom} 00:00:00`,
        tz: BUSINESS_TIMEZONE,
      });
    }
    if (q.dateTo) {
      qb.andWhere('ct.createdAt <= (CAST(:dateTo AS timestamp) AT TIME ZONE :tz)', {
        dateTo: `${q.dateTo} 23:59:59.999`,
        tz: BUSINESS_TIMEZONE,
      });
    }
    // interviewCompletedAt es `date` puro (sin hora ni zona): comparacion
    // directa de calendario, inclusive en ambos extremos.
    if (q.interviewDateFrom) {
      qb.andWhere('ct.interviewCompletedAt >= :interviewDateFrom', { interviewDateFrom: q.interviewDateFrom });
    }
    if (q.interviewDateTo) {
      qb.andWhere('ct.interviewCompletedAt <= :interviewDateTo', { interviewDateTo: q.interviewDateTo });
    }

    qb.orderBy('ct.createdAt', 'DESC').skip((page - 1) * limit).take(limit);

    const [data, total] = await qb.getManyAndCount();

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  async findOne(id: string): Promise<CandidateTracker> {
    const item = await this.repo.findOne({ where: { id } });
    if (!item || item.deletedAt) throw new NotFoundException('Candidate not found');
    return item;
  }

  async update(id: string, dto: UpdateCandidateTrackerDto, user?: HrUser): Promise<CandidateTracker> {
    const item = await this.findOne(id);

    // Snapshot ANTES del merge -- this.repo.merge() muta `item` in place,
    // asi que hay que capturar los valores viejos campo por campo antes de
    // tocarlo (antes solo se hacia para status/result; ahora para todo
    // TRACKED_FIELDS).
    const before: Record<string, unknown> = {};
    for (const field of TRACKED_FIELDS) {
      before[field] = (item as any)[field];
    }

    const patch = { ...dto };
    if (typeof patch.candidateName === 'string') {
      patch.candidateName = patch.candidateName.trim();
    }
    if (patch.phoneCountryCode !== undefined) {
      patch.phoneCountryCode = this.normalizeCountryCode(patch.phoneCountryCode);
    }
    if (patch.interviewScheduledAt !== undefined) {
      patch.interviewScheduledAt = this.normalizeDateOnly(patch.interviewScheduledAt);
    }
    if (patch.interviewCompletedAt !== undefined) {
      patch.interviewCompletedAt = this.normalizeDateOnly(patch.interviewCompletedAt);
    }
    this.repo.merge(item, patch);
    const saved = await this.repo.save(item);

    // Historial: solo se loguea el campo que realmente cambio de valor (no
    // cada PATCH toca todo -- ej. un inline edit de status no debe generar
    // una entrada de historial para recruiter si no vino en el body).
    const changedByEmployeeNumber = user?.employee_number ?? null;
    const changedByName = user ? `${user.name} ${user.last_name}`.trim() : null;

    for (const field of TRACKED_FIELDS) {
      if (!(field in patch)) continue; // el campo ni vino en este PATCH
      const prev = this.stringifyFieldValue(before[field]);
      const next = this.stringifyFieldValue((saved as any)[field]);
      if (prev !== next) {
        await this.logHistoryChange(id, field, prev, next, changedByEmployeeNumber, changedByName);
      }
    }

    return saved;
  }

  /** Sin catalogo de codigos de pais: texto libre, pero siempre se persiste
   * con "+" adelante sin importar quien llame a la API (UI, Postman, otro
   * servicio). Descarta cualquier letra y tope de 3 digitos (E.164 no
   * define codigos de pais de mas de 3 digitos). "52" -> "+52", "+52" se
   * deja igual, "" o null -> null (usa el default de la columna). */
  private normalizeCountryCode(raw: string | null | undefined): string | null {
    if (raw === undefined || raw === null) return null;
    const digits = raw.replace(/\D/g, '').slice(0, 3);
    return digits ? `+${digits}` : null;
  }

  /** dto manda "YYYY-MM-DD" (v-date-picker, ya validado por el DTO) o ""
   * para limpiar. Las columnas de entrevista son `date` (calendario puro):
   * se guardan y se devuelven como string YYYY-MM-DD, sin pasar por Date --
   * asi no hay corrimientos de zona horaria ni al guardar ni al mostrar. */
  private normalizeDateOnly(raw: string | null | undefined): string | null {
    if (!raw) return null;
    return raw.trim();
  }

  /** Normaliza cualquier valor de TRACKED_FIELDS a string (o null) para
   * poder compararlos y guardarlos en el historial de forma uniforme:
   * enums/strings tal cual, booleans (checklist de Screening) como
   * "true"/"false", fechas de entrevista ya llegan como "YYYY-MM-DD". Un
   * string vacio cuenta como "sin valor" (null), igual que en el resto del
   * modulo. */
  private stringifyFieldValue(value: unknown): string | null {
    if (value === null || value === undefined || value === '') return null;
    if (value instanceof Date) return value.toISOString();
    return String(value);
  }

  /**
   * Soft delete -- un candidato archivado sigue siendo informacion de
   * reclutamiento auditable (entrevistas, resultados), asi que nunca se
   * borra fisico ni se le tocan los adjuntos en S3. Solo se marca
   * deletedAt/deletedBy* y queda excluido de findAll/findOne (ver arriba).
   * Mismo patron que AgreementService.remove().
   */
  async remove(id: string, user?: HrUser): Promise<CandidateTracker> {
    const item = await this.findOne(id);
    if (item.deletedAt) throw new ConflictException('Candidate is already archived');

    item.deletedAt = new Date();
    item.deletedByEmployeeNumber = user?.employee_number ?? null;
    item.deletedByName = user ? `${user.name} ${user.last_name}`.trim() : null;

    return this.repo.save(item);
  }

  /** Se llama DESPUES de subir el archivo a aws_services_backend (candidate-tracker/files/upload). */
  async addAttachment(id: string, key: string): Promise<CandidateTracker> {
    const item = await this.findOne(id);
    if (!item.attachments.includes(key)) {
      item.attachments = [...item.attachments, key];
      await this.repo.save(item);
    }
    return item;
  }

  async removeAttachment(id: string, key: string): Promise<CandidateTracker> {
    const item = await this.findOne(id);
    if (item.attachments.includes(key)) {
      item.attachments = item.attachments.filter((k) => k !== key);
      await this.repo.save(item);
      await deleteCandidateTrackerS3File(id, key).catch((err) =>
        this.logger.warn(`No se pudo borrar el adjunto ${key} de S3 para ${id}: ${err?.message ?? err}`),
      );
    }
    return item;
  }
  /** Candidatos cuyo historial tiene una entrada de `field` (status/result)
   * cuyo newValue es `value` (si se especifica) dentro de [from, to].
   * Usado por findAll() para filtrar "cuando paso a valer X" en vez del
   * valor actual -- ver comentario en el DTO. Sin `value`, matchea
   * cualquier cambio de ese campo en el rango, sin importar a que valor. */
  private async findCandidateIdsByHistoryDateRange(
    field: 'status' | 'result',
    value: string | undefined,
    from: string | undefined,
    to: string | undefined,
  ): Promise<string[]> {
    const qb = this.historyRepo
      .createQueryBuilder('h')
      .select('DISTINCT h.candidateId', 'candidateId')
      .where('h.field = :field', { field });
    if (value) qb.andWhere('h.newValue = :value', { value });
    // changedAt es un instante: el dia se interpreta en hora de Chicago.
    if (from) {
      qb.andWhere('h.changedAt >= (CAST(:from AS timestamp) AT TIME ZONE :tz)', {
        from: `${from} 00:00:00`,
        tz: BUSINESS_TIMEZONE,
      });
    }
    if (to) {
      qb.andWhere('h.changedAt <= (CAST(:to AS timestamp) AT TIME ZONE :tz)', {
        to: `${to} 23:59:59.999`,
        tz: BUSINESS_TIMEZONE,
      });
    }
    const rows = await qb.getRawMany<{ candidateId: string }>();
    return rows.map((r) => r.candidateId);
  }

  /** Registra un cambio de un campo trackeado (ver TRACKED_FIELDS) en el
   * historial de auditoria. Se llama desde create() (valores iniciales) y
   * update() (solo cuando el valor efectivamente cambio). */
  private async logHistoryChange(
    candidateId: string,
    field: CandidateTrackerHistoryField,
    previousValue: string | null,
    newValue: string | null,
    changedByEmployeeNumber: string | null,
    changedByName: string | null,
  ): Promise<void> {
    const entry = this.historyRepo.create({
      candidateId,
      field,
      previousValue,
      newValue,
      changedByEmployeeNumber,
      changedByName,
    });
    await this.historyRepo.save(entry);
  }

  /** Historial de cambios de status/result, paginado. Sin filtros devuelve
   * todo el historial (mas reciente primero); con candidateId filtra a un
   * solo candidato (usado por el timeline de "Actividad" en el preview). */
  async findHistory(q: QueryCandidateTrackerHistoryDto) {
    const page = Math.max(1, q.page ?? 1);
    const limit = Math.max(1, Math.min(500, q.limit ?? 100));

    const qb = this.historyRepo.createQueryBuilder('h');
    if (q.candidateId) qb.andWhere('h.candidateId = :candidateId', { candidateId: q.candidateId });
    if (q.field) qb.andWhere('h.field = :field', { field: q.field });

    qb.orderBy('h.changedAt', 'DESC').skip((page - 1) * limit).take(limit);

    const [data, total] = await qb.getManyAndCount();

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }
  /**
   * KPIs semanales de reclutamiento (cohorte): sobre los candidatos
   * INGRESADOS en la semana [weekStart lunes 00:00, weekEnd domingo 23:59:59],
   * cuenta cuantos ya alcanzaron cada hito A LA FECHA DE HOY -- no "para el
   * fin de esa semana". Por eso "Contactados" puede incluir avances
   * posteriores a la semana de ingreso (ej. un candidato que entro el lunes
   * y recien fue contactado el jueves siguiente igual cuenta).
   *
   * Definiciones (confirmadas por Javier, 2026-09-21):
   * - Contactados: contactAttempt seteado y distinto de 'Pending Contact'
   *   (cualquier intento registrado, exitoso o no).
   * - Entrevistas programadas/realizadas: interviewScheduledAt /
   *   interviewCompletedAt seteados (campos dedicados, independientes del
   *   status).
   * - Aprobados: status actual en o despues de 'Passed Both Interview' en
   *   el orden del pipeline (asume progreso hacia adelante; si un candidato
   *   se mueve manualmente hacia atras en el status, no se recalcula con
   *   retroactividad porque no es un log de eventos, ver limitacion en
   *   candidate_tracker_status_history para eso).
   * - Contratados: status = 'Hired'. Pendientes: status = 'Pending'.
   *   No-show: status = 'No Show'. (Desde 2026-09-22 estos valores viven en
   *   status, no en result -- ver CandidateResultEnum.)
   */
  async getWeeklyKpis(q: QueryWeeklyKpisDto) {
    // "Hoy" segun el calendario de Chicago (Intl viene con Node, sin libs);
    // 'en-CA' formatea como YYYY-MM-DD. Sin esto, un proceso Node en UTC
    // cambiaria de semana a las 6-7pm hora de Chicago del domingo.
    const todayInBusinessTz = new Intl.DateTimeFormat('en-CA', {
      timeZone: BUSINESS_TIMEZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
    const reference = q.weekStart || todayInBusinessTz;

    // Aritmetica de calendario en UTC a proposito: Date.UTC + getUTCDay no
    // dependen del TZ del proceso, y aca solo importa que dia de la semana
    // es (0=domingo). Lunes = inicio de semana.
    const [y, m, d] = reference.split('-').map(Number);
    const ref = new Date(Date.UTC(y, m - 1, d));
    const dayOfWeek = ref.getUTCDay();
    const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const monday = new Date(ref);
    monday.setUTCDate(monday.getUTCDate() + diffToMonday);
    const sunday = new Date(monday);
    sunday.setUTCDate(sunday.getUTCDate() + 6);

    const weekStart = toDateOnlyUTC(monday);
    const weekEnd = toDateOnlyUTC(sunday);

    // Cohorte: ingresados entre lunes 00:00:00 y domingo 23:59:59.999 HORA
    // DE CHICAGO (createdAt es timestamptz, se convierte en SQL).
    const active = await this.repo
      .createQueryBuilder('ct')
      .where('ct.deletedAt IS NULL')
      .andWhere('ct.createdAt >= (CAST(:start AS timestamp) AT TIME ZONE :tz)', {
        start: `${weekStart} 00:00:00`,
        tz: BUSINESS_TIMEZONE,
      })
      .andWhere('ct.createdAt <= (CAST(:end AS timestamp) AT TIME ZONE :tz)', {
        end: `${weekEnd} 23:59:59.999`,
        tz: BUSINESS_TIMEZONE,
      })
      .getMany();

    // Revisado 2026-09-22 al agregar el pipeline alternativo de 6 statuses
    // nuevos (ver enums.ts): se suman aca los 2 que representan el mismo
    // hito ("ya paso la etapa de entrevistas, esta en pasos finales") --
    // PassedHrInterviewPendingDocs y PendingPaperworkForSos, equivalentes a
    // AwaitingPaperwork de la lista original. Los otros 4 statuses nuevos
    // NO cuentan como aprobado: ForHrInterview/ForInPersonInterview siguen
    // en proceso (todavia no hay decision), y FailedInPersonInterview/
    // WithdrewApplication son salidas negativas del pipeline.
    //
    // 2026-09-22 (b): los valores que antes eran result y ahora son status.
    // Cuentan como aprobado los que implican oferta/entrenamiento (ya paso
    // las entrevistas): Hired, Accepted Offer, Ready for Training, Ready,
    // Pending Docs. Los negativos (Reject*, Fail the Training, Not Ok with
    // Pay, ...) y los intermedios (In Process, Pending, No Show, ...) no.
    const APPROVED_OR_LATER: CandidateStatusEnum[] = [
      CandidateStatusEnum.PassedBothInterviews,
      CandidateStatusEnum.NextStepsEmailSent,
      CandidateStatusEnum.Onboarding,
      CandidateStatusEnum.Training,
      CandidateStatusEnum.AwaitingPaperwork,
      CandidateStatusEnum.PassedHrInterviewPendingDocs,
      CandidateStatusEnum.PendingPaperworkForSos,
      CandidateStatusEnum.Hired,
      CandidateStatusEnum.AcceptedOffer,
      CandidateStatusEnum.ReadyForTraining,
      CandidateStatusEnum.Ready,
      CandidateStatusEnum.PendingDocs,
    ];

    const ingresados = active.length;
    const contactados = active.filter((c) => c.contactAttempt && c.contactAttempt !== ContactAttemptEnum.PendingContact).length;
    const entrevistasProgramadas = active.filter((c) => !!c.interviewScheduledAt).length;
    const entrevistasRealizadas = active.filter((c) => !!c.interviewCompletedAt).length;
    const noShow = active.filter((c) => c.status === CandidateStatusEnum.NoShow).length;
    const aprobados = active.filter((c) => APPROVED_OR_LATER.includes(c.status)).length;
    const contratados = active.filter((c) => c.status === CandidateStatusEnum.Hired).length;
    const pendientes = active.filter((c) => c.status === CandidateStatusEnum.Pending).length;

    const pct = (num: number, den: number) => (den > 0 ? Math.round((num / den) * 1000) / 10 : 0);

    return {
      // YYYY-MM-DD (calendario de Chicago), no ISO con hora: el frontend lo
      // muestra tal cual sin volver a convertir zona (ver weekRangeLabel).
      weekStart,
      weekEnd,
      timezone: BUSINESS_TIMEZONE,
      counts: {
        ingresados,
        contactados,
        entrevistasProgramadas,
        entrevistasRealizadas,
        noShow,
        aprobados,
        contratados,
        pendientes,
      },
      rates: {
        tasaContacto: pct(contactados, ingresados),
        tasaEntrevista: pct(entrevistasRealizadas, contactados),
        tasaNoShow: pct(noShow, entrevistasProgramadas),
        tasaAprobacion: pct(aprobados, entrevistasRealizadas),
        tasaContratacion: pct(contratados, ingresados),
      },
    };
  }
}

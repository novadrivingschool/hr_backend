import { BadRequestException, ForbiddenException, Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, DeepPartial, QueryRunner, Repository } from 'typeorm';
import * as moment from 'moment-timezone';
import { Logger } from '@nestjs/common';
import axios from 'axios';
import * as ExcelJS from 'exceljs';
import { Response } from 'express';

import { CreateICareDto } from './dto/create-i-care.dto';
import { UpdateICareDto } from './dto/update-i-care.dto';
import { CommitICareDto } from './dto/commit-i-care.dto';
import { JustifyICareDto } from './dto/justify-i-care.dto';
import { ResolveICareDto } from './dto/resolve-i-care.dto';
import { ApproveCommitICareDto } from './dto/approve-commit-i-care.dto';
import { AddSeguimientoICareDto } from './dto/add-seguimiento-i-care.dto';
import { FulfillCommitICareDto } from './dto/fulfill-commit-i-care.dto';
import { CoordinatorRejectICareDto } from './dto/coordinator-reject-i-care.dto';
import { HrRejectICareDto } from './dto/hr-reject-i-care.dto';
import { ReviewRejectionICareDto } from './dto/review-rejection-i-care.dto';
import { ReviewCreationICareDto } from './dto/review-creation-i-care.dto';
import { ApproveJustificationICareDto } from './dto/approve-justification-i-care.dto';
import { ICareAnalyticsQueryDto } from './dto/analytics-query-i-care.dto';
import { ICare, ICareStatus, ICareUrgency } from './entities/i-care.entity';
import { Employee } from '../employees/entities/employee.entity'; // ajusta el path si es necesario
import { ICareReason } from '../i_care_reasons/entities/i_care_reason.entity';
import { ICareOffenseCategory } from '../i_care_reasons/enums/offense-category.enum';
import { pushBellNotification } from '../common/it-api.client';
import { EmployeesV2Service } from '../employees/employees-v2.service';
import { LogbookService } from '../logbook/logbook.service';

// -- Types ----------------------------------------------------------------------

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  pageCount: number;
}

export interface ImportICareResult {
  inserted: number;
  skipped: number;
  errors: { row: number; message: string }[];
}

/**
 * Eventos de email disponibles en el flujo de un iCare.
 * Cada evento mapea a un endpoint del email service:
 *   POST /mailer-send/i-care/:id/:event  →  body: { recipients: string[] }
 *
 * REGLA Management: todo destinatario "role 'management'" listado abajo está
 * gateado por ICareService.isHighCriticalUrgency(record) — Management SOLO
 * recibe correos de un iCare mientras su urgency vigente sea High o Critical.
 * El gate se evalúa con la urgency ACTUAL en cada evento (no "una vez H/C,
 * para siempre"): si el caso se baja a Low/Medium, Management deja de recibir
 * correos de ese caso desde ese punto en adelante, sin excepción (incluye
 * incluso creation_review, que es un caso de conflicto de interés).
 *
 * Matriz de destinatarios por evento:
 *   created_staff       → staff_name (quien creó el registro)
 *   created_coordinator → coordinator(s) (assigned coordinators, no submitter identity)
 *   created_hr          → role 'hr' (con identidad completa)
 *   created_management  → role 'management' (con identidad completa)
 *   justified_staff       → staff_name (el staff al que pertenece el iCare)
 *   justified_coordinator → coordinator(s) asignados
 *   justified_hr          → role 'hr'
 *   justified_management  → role 'management'
 *   committed_staff       → staff_name (confirmación de su commit)
 *   committed_coordinator → coordinator(s)
 *   committed_hr          → role 'hr'
 *   committed_management  → role 'management'
 *   seguimiento_added     → staff_name + coordinator(s) + role 'hr' + role 'management'
 *   seguimiento_added_staff       → staff_name
 *   seguimiento_added_coordinator → coordinator(s)
 *   seguimiento_added_hr          → role 'hr'
 *   seguimiento_added_management  → role 'management'
 *   commit_fulfilled_staff        → staff_name
 *   commit_fulfilled_coordinator  → coordinator(s)
 *   commit_fulfilled_hr           → role 'hr'
 *   commit_fulfilled_management   → role 'management'
 *   resolved_staff                → staff_name
 *   resolved_coordinator          → coordinator(s)
 *   resolved_hr                   → role 'hr'
 *   resolved_management           → role 'management'
 *
 *   Caso "propio personal" (submitter es responsible/supervisor del staff reportado):
 *   creation_review_submitter → el submitter SIEMPRE recibe confirmación de que su reporte
 *                                fue recibido y está pendiente de aprobación por HR/Management.
 *   creation_review_hr / creation_review_management → HR / Management (coordinator(s) asignados NO se notifican, status=pending_creation_review)
 *   creation_approved_coordinator/hr/management      → HR/Mgmt aprobó la creación, vuelve a PENDING
 *   creation_rejected_staff/coordinator/hr/management → HR/Mgmt rechazó la creación, va directo a REJECTED
 */
type ICareEmailEvent =
  | 'created_staff' | 'created_coordinator' | 'created_hr' | 'created_management'
  | 'created_operator' | 'created_instructor' | 'created_teacher'
  | 'justified_staff' | 'justified_coordinator' | 'justified_hr' | 'justified_management'
  | 'committed_staff' | 'committed_coordinator' | 'committed_hr' | 'committed_management'
  | 'seguimiento_added_staff' | 'seguimiento_added_coordinator' | 'seguimiento_added_hr' | 'seguimiento_added_management'
  | 'commit_fulfilled_staff' | 'commit_fulfilled_coordinator' | 'commit_fulfilled_hr' | 'commit_fulfilled_management'
  // 2026-08-23: fired ONCE at the end of the Coaching Session bundle
  // (approveCommit/fulfillCommit with coaching_session_bundle:true) instead
  // of 'seguimiento_added_*'/'commit_fulfilled_*' — see triggerCoachingSessionCompletedEmails.
  | 'coaching_session_completed_staff' | 'coaching_session_completed_coordinator'
  | 'coaching_session_completed_hr' | 'coaching_session_completed_management'
  | 'resolved_staff' | 'resolved_coordinator' | 'resolved_hr' | 'resolved_management'
  | 'coordinator_rejected_coordinator' | 'coordinator_rejected_hr' | 'coordinator_rejected_management'
  | 'rejection_review_accepted_coordinator' | 'rejection_review_accepted_hr' | 'rejection_review_accepted_management'
  | 'rejection_review_overridden_staff' | 'rejection_review_overridden_coordinator' | 'rejection_review_overridden_hr' | 'rejection_review_overridden_management'
  | 'rejection_review_accepted_reviewer' | 'rejection_review_overridden_reviewer'
  | 'hr_rejected_hr' | 'hr_rejected_management'
  | 'pending_hr_review_coordinator' | 'pending_hr_review_hr' | 'pending_hr_review_management'
  | 'hc_handled_by_coordinator_coordinator' | 'hc_handled_by_coordinator_hr' | 'hc_handled_by_coordinator_management'
  | 'hc_accepted_hr' | 'hc_accepted_management' | 'hc_accepted_staff'
  | 'justification_downgraded_staff' | 'justification_downgraded_coordinator'
  | 'justification_downgraded_hr' | 'justification_downgraded_management'
  | 'downgrade_returned_coordinator' | 'downgrade_returned_hr' | 'downgrade_returned_management'
  | 'creation_review_submitter' | 'creation_review_hr' | 'creation_review_management'
  | 'creation_approved_coordinator' | 'creation_approved_hr' | 'creation_approved_management'
  | 'creation_rejected_staff' | 'creation_rejected_coordinator' | 'creation_rejected_hr' | 'creation_rejected_management';

// -- Service --------------------------------------------------------------------

@Injectable()
export class ICareService {
  private readonly logger = new Logger(ICareService.name);

  constructor(
    @InjectRepository(ICare)
    private readonly iCareRepository: Repository<ICare>,

    @InjectRepository(Employee)
    private readonly employeeRepository: Repository<Employee>,

    @InjectRepository(ICareReason)
    private readonly iCareReasonRepository: Repository<ICareReason>,

    private readonly employeesV2Service: EmployeesV2Service,

    private readonly logbookService: LogbookService,
  ) { }

  /**
   * 2026-08-28: la urgency de un iCare ya NO se elige libremente (ni al crear,
   * ni al editar, ni en ningun paso del flujo) -- se deriva de la reason
   * elegida (columna `urgency` del catalogo i_care_reason) y queda fija.
   * Se resuelve en el backend (no se confia en lo que mande el cliente) para
   * que no sea evadible, igual que el hueco ya documentado de caller_role.
   */
  private async resolveUrgencyForReason(reasonText: string): Promise<ICareUrgency> {
    const reasonRecord = await this.iCareReasonRepository.findOne({ where: { reason: reasonText } });
    if (!reasonRecord) {
      throw new BadRequestException(`Reason "${reasonText}" was not found in the reasons catalog`);
    }
    if (!reasonRecord.urgency) {
      throw new BadRequestException(`Reason "${reasonText}" does not have an urgency assigned yet -- ask an admin to set it in iCare Reasons before using it`);
    }
    return reasonRecord.urgency;
  }

  /**
   * 2026-09-19: gemelo de resolveUrgencyForReason() pero para offense_category.
   * A diferencia de urgency, offense_category es OPCIONAL en el catalogo
   * (i_care_reason.offense_category es nullable) -- por eso esta funcion NO
   * tira error si el reason no tiene offense_category asignada, devuelve null.
   * Hace su propia query (en vez de fusionarse con resolveUrgencyForReason)
   * para no tocar esa funcion ya probada en produccion -- el costo extra es
   * una consulta mas contra una tabla chica (catalogo de reasons).
   */
  private async resolveOffenseCategoryForReason(reasonText: string): Promise<ICareOffenseCategory | null> {
    const reasonRecord = await this.iCareReasonRepository.findOne({ where: { reason: reasonText } });
    if (!reasonRecord) {
      throw new BadRequestException(`Reason "${reasonText}" was not found in the reasons catalog`);
    }
    return reasonRecord.offense_category ?? null;
  }

  // -- Email helpers ----------------------------------------------------------

  /**
   * Obtiene los nova_email de todos los empleados activos con un rol dado.
   * Se usa internamente en cada trigger para resolver destinatarios,
   * y también se expone como endpoint auxiliar GET /i-care/emails-by-role/:role.
   *
   * @param role - 'hr' | 'management'
   * @returns    - Array de nova_email (sin nulls ni vacíos)
   */
  private async getEmailsByAnyRole(role: string): Promise<string[]> {
    try {
      const rawResults = await this.employeeRepository
        .createQueryBuilder('emp')
        .select('DISTINCT LOWER(TRIM(emp.nova_email))', 'email')
        .where('emp.status = :status', { status: 'Active' })
        .andWhere("NULLIF(TRIM(emp.nova_email), '') IS NOT NULL")
        .andWhere('emp.roles::jsonb @> :roleParam::jsonb', { roleParam: JSON.stringify([role]) })
        .getRawMany<{ email: string }>();
      return rawResults.map(r => r.email);
    } catch (error) {
      this.logger.error(`[getEmailsByAnyRole] Failed for role '${role}': ${error?.message}`);
      return [];
    }
  }

  async getEmailsByRole(role: 'hr' | 'management'): Promise<string[]> {
    try {
      const rawResults = await this.employeeRepository
        .createQueryBuilder('emp')
        .select('DISTINCT LOWER(TRIM(emp.nova_email))', 'email')
        .where('emp.status = :status', { status: 'Active' })
        .andWhere("NULLIF(TRIM(emp.nova_email), '') IS NOT NULL")
        .andWhere('emp.roles::jsonb @> :roleParam::jsonb', { roleParam: JSON.stringify([role]) })
        .getRawMany<{ email: string }>();

      const emails = rawResults.map(r => r.email);

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
   * 2026-08-28: gemelo de getEmailsByAnyRole() pero devuelve employee_number
   * en vez de nova_email.
   *
   * ⚠️ DEPRECADA / SIN USO 2026-08-28 (mismo día, tras reporte del usuario
   * "no llega a hr o management"): esta función resuelve contra la tabla
   * LOCAL `employees` de hr_backend, camino que nunca se había probado para
   * bell -- el personal de HR/Management aparentemente no tiene
   * `employee_number` poblado ahí (por eso el email, que usa `nova_email`,
   * sí funcionaba contra la misma tabla, y la campana no). Los 6
   * trigger*BellNotification() de iCare pasaron a usar
   * `resolveEmployeeNumbersByRoles()` (common/it-api.client.ts), el
   * mecanismo YA probado en producción por time_off_request.service.ts, que
   * resuelve employee_number por rol vía HTTP contra NOVA_ONE_API
   * (`/employees/filter`, campo `permissions`) en vez de la tabla local.
   * Se deja sin borrar (convención del proyecto) pero NO USAR para nuevos
   * triggers de campana -- usar resolveEmployeeNumbersByRoles() en su lugar.
   */
  private async getEmployeeNumbersByAnyRole(role: string): Promise<string[]> {
    try {
      const rawResults = await this.employeeRepository
        .createQueryBuilder('emp')
        .select('DISTINCT emp.employee_number', 'employee_number')
        .where('emp.status = :status', { status: 'Active' })
        .andWhere("NULLIF(TRIM(emp.employee_number), '') IS NOT NULL")
        .andWhere('emp.roles::jsonb @> :roleParam::jsonb', { roleParam: JSON.stringify([role]) })
        .getRawMany<{ employee_number: string }>();
      return rawResults.map(r => r.employee_number);
    } catch (error) {
      this.logger.error(`[getEmployeeNumbersByAnyRole] Failed for role '${role}': ${error?.message}`);
      return [];
    }
  }

  /**
   * ⚠️ 2026-08-28 (segundo intento, tras confirmar con el usuario que el
   * primero seguia sin funcionar): se habia migrado a
   * resolveEmployeeNumbersByRoles() (common/it-api.client.ts, HTTP contra
   * NOVA_ONE_API externo) -- pero esa dependencia de red nunca pudo
   * verificarse desde esta sesion (ni alcanzabilidad del servicio, ni que
   * el body {status,permissions} sea el contrato real que espera). Se
   * encontro un patron YA PROBADO EN PRODUCCION dentro de este MISMO
   * backend: leave_of_absence.service.ts (recipientsForRoles) inyecta
   * EmployeesV2Service y llama a findByRoles(roles) -- misma tabla local
   * `employees`, mismo query roles::jsonb @> [role] que ya usan
   * getEmailsByRole/getEmailsByAnyRole (los emails, que SI llegan), sin
   * salir a ningun servicio externo. Se adopta ese mecanismo aca: cero
   * dependencia de red, mismo proceso, misma conexion a DB que el resto
   * de ICareService.
   *
   * resolveEmployeeNumbersByRoles() de it-api.client.ts NO se toco -- sigue
   * en uso por time_off_request.service.ts, fuera del alcance de este fix.
   */
  private async resolveEmployeeNumbersViaEmployeesV2(roles: string[]): Promise<string[]> {
    try {
      const employees = await this.employeesV2Service.findByRoles(roles);
      return employees.map(e => e.employee_number).filter(Boolean);
    } catch (err: any) {
      this.logger.warn(`[bell] findByRoles failed for roles [${roles.join(',')}]: ${err?.message || err}`);
      return [];
    }
  }

  /**
   * Gate único para decidir si Management debe ser notificado de un evento.
   * Regla de negocio: Management SOLO recibe correos de un iCare mientras su
   * urgency vigente sea High o Critical — se evalúa con la urgency ACTUAL del
   * record en cada evento (no "una vez H/C, para siempre"), así que si el caso
   * se baja a Low/Medium (downgrade), Management deja de recibir correos de ese
   * caso a partir de ese momento, incluyendo el aviso de creación (creation_review)
   * y cualquier otro evento del flujo. Se usa en TODOS los triggerXxxEmails().
   */
  private static isHighCriticalUrgency(record: ICare): boolean {
    return record.urgency === ICareUrgency.HIGH || record.urgency === ICareUrgency.CRITICAL;
  }

  /**
   * 2026-09-20: tabla de sanciones por offense_category, a pedido explicito del
   * usuario. Cada categoria tiene su propia cantidad de escalones -- B llega a
   * Discharge en el 4to, C y D en el 6to. `permanent: true` marca desde que
   * escalon esa categoria "queda como registro permanente" (acta administrativa
   * en el logbook, ver createPermanentOffenseLogbookEntry()): B lo es desde el
   * 1er escalon (no tiene ningun escalon de "solo advertencia"), C desde el 3ro,
   * D desde el 5to -- confirmado explicitamente por el usuario, no es una formula
   * derivable de los dias de sancion (se probo y no hay patron matematico limpio).
   *
   * El indice de este array NO es "cuantas veces esta categoria en particular fue
   * ofendida" -- ver resolveOffenseEscalation() para el porque.
   */
  private static readonly OFFENSE_SANCTION_LADDER: Record<ICareOffenseCategory, { label: string; permanent: boolean }[]> = {
    [ICareOffenseCategory.CLASS_B_SERIOUS]: [
      { label: '7 working days suspension', permanent: true },
      { label: '15 working days suspension', permanent: true },
      { label: '30 working days suspension', permanent: true },
      { label: 'Discharge/Dismissal', permanent: true },
    ],
    [ICareOffenseCategory.CLASS_C_MODERATE]: [
      { label: 'Written Warning', permanent: false },
      { label: '1 day suspension', permanent: false },
      { label: '2 working days suspension', permanent: true },
      { label: '4 working days suspension', permanent: true },
      { label: '6 working days suspension', permanent: true },
      { label: 'Discharge/Dismissal', permanent: true },
    ],
    [ICareOffenseCategory.CLASS_D_LIGHT]: [
      { label: 'Verbal Warning', permanent: false },
      { label: 'Written Warning', permanent: false },
      { label: '1 day suspension', permanent: false },
      { label: '3 days suspension', permanent: false },
      { label: '5 days suspension', permanent: true },
      { label: 'Discharge/Dismissal', permanent: true },
    ],
  };

  /**
   * 2026-09-20: calcula la posicion (offense_number) y la sancion que le toca a
   * UNA ofensa nueva (justify(justified=true) de un iCare con offense_category).
   * Reglas confirmadas explicitamente por el usuario, con ejemplos concretos:
   *
   * 1. Hay UN solo contador compartido entre B, C y D (NO uno independiente por
   *    categoria) -- "numero de ofensa total". Cada ofensa nueva usa ese numero
   *    (vigentes + 1) para buscar la fila en la tabla de SU PROPIA categoria.
   *    Ej.: si el staff ya lleva 2 ofensas vigentes (de cualquier categoria) y
   *    comete su primera ofensa de Class C, esa NO es "1ra de C" -- es la #3,
   *    y busca la fila 3 de la tabla de C (2 working days suspension, que ya
   *    cruza el umbral de permanente de C).
   * 2. "Vigentes" = todas las ofensas YA marcadas is_permanent_offense=true
   *    (esas NUNCA expiran, por eso se llaman permanentes) + las que NO son
   *    permanentes pero todavia no cumplen 12 meses desde su justified_date.
   *    Una ofensa no-permanente que ya cumplio el año deja de contar para
   *    futuras ofensas (pero su propio offense_number/sancion ya asignado en
   *    su momento no se recalcula retroactivamente).
   * 3. El offense_number de una ofensa NUEVA nunca se vuelve a tocar despues.
   *
   * Si el numero resultante excede la cantidad de escalones de la categoria
   * (ej. #7 pero la ofensa es Class B, que solo tiene 4), se queda fijo en el
   * ultimo escalon (Discharge/Dismissal) -- no hay nada mas severo.
   */
  private async resolveOffenseEscalation(
    staffEmployeeNumber: string | undefined | null,
    category: ICareOffenseCategory,
    excludeId: string,
  ): Promise<{ offenseNumber: number; isPermanent: boolean; sanctionLabel: string }> {
    const ladder = ICareService.OFFENSE_SANCTION_LADDER[category];

    if (!staffEmployeeNumber) {
      // Sin employee_number no hay como rastrear historial -- se trata como 1ra ofensa.
      this.logger.warn(`[offense] iCare id=${excludeId} sin staff_name.employee_number -- no se pudo calcular historial, se asume 1ra ofensa`);
      const row = ladder[0];
      return { offenseNumber: 1, isPermanent: row.permanent, sanctionLabel: row.label };
    }

    const oneYearAgo = moment().tz('America/Chicago').subtract(1, 'year').format('YYYY-MM-DD');

    const vigentesCount = await this.iCareRepository
      .createQueryBuilder('i_care')
      .where('i_care.id != :excludeId', { excludeId })
      .andWhere(`i_care.staff_name ->> 'employee_number' = :emp`, { emp: staffEmployeeNumber })
      .andWhere('i_care.offense_number IS NOT NULL')
      .andWhere(
        new Brackets((qb) => {
          qb.where('i_care.is_permanent_offense = true').orWhere('i_care.justified_date >= :oneYearAgo', { oneYearAgo });
        }),
      )
      .getCount();

    const offenseNumber = vigentesCount + 1;
    const row = ladder[Math.min(offenseNumber, ladder.length) - 1];
    this.logger.log(`[offense] iCare id=${excludeId} staff=${staffEmployeeNumber} categoria=${category} vigentes=${vigentesCount} -> offense_number=${offenseNumber} sancion="${row.label}" permanente=${row.permanent}`);

    return { offenseNumber, isPermanent: row.permanent, sanctionLabel: row.label };
  }

  /**
   * 2026-09-20: cuando una ofensa cruza el umbral de permanente (is_permanent_offense
   * true), se crea SOLA la entrada en el logbook del empleado (seccion 'sanctions')
   * -- a pedido explicito del usuario, sin paso manual de HR. Fire-and-forget desde
   * justify(): nunca debe tumbar la justificacion del iCare si esto falla.
   */
  private async createPermanentOffenseLogbookEntry(record: ICare): Promise<void> {
    const staffEmployeeNumber = record.staff_name?.employee_number;
    if (!staffEmployeeNumber) {
      this.logger.warn(`[offense] no se pudo crear registro permanente en logbook para iCare id=${record.id} -- falta staff_name.employee_number`);
      return;
    }

    const employee = await this.employeeRepository.findOne({
      where: { employee_number: staffEmployeeNumber },
      select: ['multi_location', 'multi_company', 'multi_department'],
    });

    const now = moment().tz('America/Chicago');

    try {
      await this.logbookService.create({
        employee_data: {
          name: record.staff_name?.name ?? '',
          last_name: record.staff_name?.last_name ?? '',
          employee_number: staffEmployeeNumber,
          multi_location: (employee as any)?.multi_location ?? [],
          multi_company: (employee as any)?.multi_company ?? [],
          multi_department: (employee as any)?.multi_department ?? [],
        },
        section: 'sanctions',
        data: {
          warning_type: record.offense_category ?? '',
          disciplinary_action: `${record.offense_sanction_label} — iCare offense #${record.offense_number} (${record.reason})`,
          sanction_date: now.format('YYYY-MM-DD'),
        },
      });
      this.logger.log(`[offense] registro permanente creado en logbook para employee_number=${staffEmployeeNumber} (iCare id=${record.id})`);
    } catch (err: any) {
      this.logger.error(`❌ Failed to create permanent offense logbook entry for iCare id=${record.id}`, err?.message || err);
    }
  }

  /**
   * 2026-09-20: preview INFORMATIVO del numero de ofensa y sancion que le
   * tocaria a este iCare SI se justifica ahora mismo -- a pedido explicito
   * del usuario, para mostrarlo en el dialog de Justify antes de confirmar.
   * NO tiene efectos secundarios (no guarda nada, no crea nada en logbook) --
   * usa el mismo resolveOffenseEscalation() que justify(), pero solo para
   * leer. El numero real puede cambiar si otra ofensa del mismo staff se
   * confirma entre este preview y el submit real -- es informativo, no una
   * reserva.
   */
  async previewOffenseEscalation(id: string): Promise<{
    offenseNumber: number;
    isPermanent: boolean;
    sanctionLabel: string;
    category: ICareOffenseCategory;
  } | null> {
    const record = await this.iCareRepository.findOne({ where: { id } });
    if (!record) throw new NotFoundException(`ICare record with id ${id} not found`);

    if (!record.offense_category) return null;

    const escalation = await this.resolveOffenseEscalation(
      record.staff_name?.employee_number,
      record.offense_category,
      record.id,
    );

    return { ...escalation, category: record.offense_category };
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

    const url = `${base}/i-care-email/${id}/${event}`;
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
   * Dispara los emails de creación en paralelo:
   *   created_staff              → quien creó el registro (caso normal)
   *   created_coordinator        → assigned coordinators (no submitter identity)
   *   created_hr                 → role 'hr' (con identidad completa)
   *   created_management         → role 'management' (con identidad completa)
   *   creation_review_submitter  → quien creó el registro, cuando el caso requiere
   *                                revisión de HR/Management (reemplaza a created_staff)
   */
  private async triggerCreatedEmails(id: string, record: ICare): Promise<void> {
    const [hrEmails, managementEmails, hrAssistantEmails] = await Promise.all([
      this.getEmailsByRole('hr'),
      this.getEmailsByRole('management'),
      this.getEmailsByAnyRole('hr-assistant'),
    ]);
    const allHrEmails = [...hrEmails, ...hrAssistantEmails];

    const staffEmail = record.submitter?.nova_email ?? null;
    const coordinatorEmails = (record.responsible ?? []).map(r => r.nova_email).filter(Boolean);

    const sends: Promise<void>[] = [];

    const isHighCritical = record.urgency === ICareUrgency.HIGH || record.urgency === ICareUrgency.CRITICAL;
    const isCoordinatorCase = record.staff_name?.is_coordinator === true;
    // "Propio personal": el submitter (coordinator) es responsible/supervisor del staff reportado.
    // El caso queda oculto para el coordinator hasta que HR/Management aprueben la creación.
    const isCreationReviewCase = record.creation_review_required === true;

    // Ni el creator, ni los coordinators asignados, ni HR/Management reciben el correo
    // genérico "New Case" mientras el caso está pendiente de revisión de creación.
    // En ese caso, HR/Management solo reciben 'creation_review_hr'/'creation_review_management' (abajo).
    if (staffEmail && !isCreationReviewCase) {
      sends.push(this.triggerEmail(id, 'created_staff', [staffEmail]));
    }
    // 2026-09-20: a pedido explicito del usuario, coordinator SI recibe email en
    // High/Critical (antes se excluia a proposito -- la campana, en cambio, nunca
    // tuvo este gate por urgency, ver triggerCreatedBellNotification). Sigue
    // excluido solo si el staff reportado ES coordinator, o si es caso de
    // creation-review (personal propio, oculto hasta aprobacion de HR/Mgmt).
    if (coordinatorEmails.length > 0 && !isCoordinatorCase && !isCreationReviewCase) {
      sends.push(this.triggerEmail(id, 'created_coordinator', coordinatorEmails));
    }
    if (allHrEmails.length > 0 && !isCreationReviewCase) {
      sends.push(this.triggerEmail(id, 'created_hr', allHrEmails));
    }
    // Management solo entra en el loop de correos si el caso ya es High/Critical.
    if (managementEmails.length > 0 && !isCreationReviewCase && isHighCritical) {
      sends.push(this.triggerEmail(id, 'created_management', managementEmails));
    }
    // Notificación específica pidiendo a HR/Management que revisen la CREACIÓN
    // (el coordinator reportó a su propio personal — conflicto de interés).
    if (isCreationReviewCase) {
      // El submitter SIEMPRE debe recibir confirmación de que su reporte fue recibido,
      // aunque el caso quede oculto para el resto (coordinator/HR genérico) hasta la revisión.
      if (staffEmail) sends.push(this.triggerEmail(id, 'creation_review_submitter', [staffEmail]));
      if (allHrEmails.length > 0) sends.push(this.triggerEmail(id, 'creation_review_hr', allHrEmails));
      // Management también gateado por High/Critical, aunque sea un caso de
      // conflicto de interés (confirmado explícitamente — no es excepción).
      if (managementEmails.length > 0 && isHighCritical) sends.push(this.triggerEmail(id, 'creation_review_management', managementEmails));
    }

    // Position-based emails: Operator / Instructor / Teacher (skip if High/Critical, coordinator-as-staff, or creation-review)
    if (!isHighCritical && !isCoordinatorCase && !isCreationReviewCase && record.submitter?.employee_number) {
      const positionRoleMap: Record<string, { event: ICareEmailEvent; role: string }> = {
        'Operator':   { event: 'created_operator',   role: 'i-care-operator' },
        'Instructor': { event: 'created_instructor', role: 'i-care-instructor' },
        'Teacher':    { event: 'created_teacher',    role: 'i-care-teacher' },
      };

      const submitterEmployee = await this.employeeRepository.findOne({
        where: { employee_number: record.submitter.employee_number },
        select: ['multi_position'],
      });

      const positions: string[] = (submitterEmployee as any)?.multi_position ?? [];
      this.logger.log(`[triggerCreatedEmails] submitter positions: ${JSON.stringify(positions)}`);

      for (const pos of positions) {
        const mapping = positionRoleMap[pos];
        if (!mapping) continue;
        const roleEmails = await this.getEmailsByAnyRole(mapping.role);
        if (roleEmails.length > 0) {
          sends.push(this.triggerEmail(id, mapping.event, roleEmails));
        }
      }
    }

    await Promise.all(sends);
  }

  /**
   * 2026-08-28: empuja la campana genérica de it_backend (pushBellNotification,
   * ver common/it-api.client.ts) para el evento de creación. Misma resolución
   * de "quién" que triggerCreatedEmails() de arriba, traducida a employee_number
   * en vez de nova_email, MENOS el propio actor -- nadie necesita que le avisen
   * de lo que él mismo acaba de hacer -- salvo la excepción que YA existe para
   * el email en el caso "propio personal": el submitter SÍ recibe confirmación
   * (mismo criterio que 'creation_review_submitter'), porque ahí el caso queda
   * oculto para el resto y es la única forma de que se entere de que quedó
   * pendiente de aprobación.
   * Cada push va en su propio try/catch: pushBellNotification() (a diferencia
   * de triggerEmail()) NO traga sus propios errores -- si el push a HR/Mgmt
   * falla, el de confirmación al submitter debe intentarse igual.
   * Fire-and-forget desde create(): nunca debe tumbar la creación del record.
   */
  private async triggerCreatedBellNotification(id: string, record: ICare): Promise<void> {
    const isHighCritical = ICareService.isHighCriticalUrgency(record);
    const isCoordinatorCase = record.staff_name?.is_coordinator === true;
    const isCreationReviewCase = record.creation_review_required === true;
    const staffLabel = `${record.staff_name?.name ?? ''} ${record.staff_name?.last_name ?? ''}`.trim() || 'a staff member';
    const submitterLabel = `${record.submitter?.name ?? ''} ${record.submitter?.last_name ?? ''}`.trim() || 'A coordinator';

    // HR/Management/HR-Assistant via EmployeesV2Service.findByRoles() --
    // ver JSDoc de resolveEmployeeNumbersViaEmployeesV2() mas arriba para el
    // historial completo (2 intentos previos descartados).
    const [allHrNumbers, mgmtNumbers] = await Promise.all([
      this.resolveEmployeeNumbersViaEmployeesV2(['hr', 'hr-assistant']),
      this.resolveEmployeeNumbersViaEmployeesV2(['management']),
    ]);
    this.logger.log(`[bell:${id}] hr/hr-assistant resolved=${allHrNumbers.length} [${allHrNumbers.join(',')}] management resolved=${mgmtNumbers.length} [${mgmtNumbers.join(',')}]`);

    if (isCreationReviewCase) {
      // Caso "propio personal": oculto para coordinators. Mismo público que
      // creation_review_hr / creation_review_management.
      // 2026-08-28: Management SIN gate de urgency, a pedido explícito del
      // usuario (ver nota completa en el caso normal, más abajo).
      const adminRecipients = [...new Set([...allHrNumbers, ...mgmtNumbers])];
      if (adminRecipients.length > 0) {
        try {
          await pushBellNotification({
            category: 'icare',
            type: 'creation_review',
            title: `iCare Creation Needs Approval — ${record.urgency}`,
            message: `${submitterLabel} reported ${staffLabel} — review required before this case proceeds.`,
            link: `/i-care?icare=${id}`,
            source_id: id,
            recipients: adminRecipients,
          });
        } catch (err: any) {
          this.logger.error(`❌ Failed to push 'creation_review' admin bell notification for id=${id}`, err?.message || err);
        }
      }

      const submitterNumber = record.submitter?.employee_number;
      if (submitterNumber) {
        try {
          await pushBellNotification({
            category: 'icare',
            type: 'creation_review',
            title: `iCare Submitted — Pending Review (${record.urgency})`,
            message: `Your report about ${staffLabel} is pending HR/Management approval before it proceeds.`,
            link: `/my-i-care?icare=${id}`,
            source_id: id,
            recipients: [submitterNumber],
          });
        } catch (err: any) {
          this.logger.error(`❌ Failed to push 'creation_review' submitter bell notification for id=${id}`, err?.message || err);
        }
      }
      return;
    }

    // Caso normal.
    // 2026-08-28: a pedido explícito del usuario, la campana NO gatea
    // coordinator ni management por urgency ("independiente de la urgency
    // tiene que llegar al coordinator y a hr y management") -- a diferencia
    // del email (triggerCreatedEmails), que sí lo hace. Se mantiene SOLO el
    // gate de isCoordinatorCase (el staff reportado ES coordinator), que es
    // una regla distinta y no tiene que ver con urgency.
    const recipients = new Set<string>(allHrNumbers);
    if (!isCoordinatorCase) {
      (record.responsible ?? []).forEach(r => { if (r?.employee_number) recipients.add(r.employee_number); });
    }
    mgmtNumbers.forEach(n => recipients.add(n));

    // Roles por posición (Operator/Instructor/Teacher) — mismo gate que el email.
    if (!isHighCritical && !isCoordinatorCase && record.submitter?.employee_number) {
      const positionRoleMap: Record<string, string> = {
        'Operator': 'i-care-operator',
        'Instructor': 'i-care-instructor',
        'Teacher': 'i-care-teacher',
      };
      const submitterEmployee = await this.employeeRepository.findOne({
        where: { employee_number: record.submitter.employee_number },
        select: ['multi_position'],
      });
      const positions: string[] = (submitterEmployee as any)?.multi_position ?? [];
      for (const pos of positions) {
        const role = positionRoleMap[pos];
        if (!role) continue;
        const roleNumbers = await this.resolveEmployeeNumbersViaEmployeesV2([role]);
        roleNumbers.forEach(n => recipients.add(n));
      }
    }

    if (recipients.size === 0) {
      this.logger.warn(`[triggerCreatedBellNotification] no recipients resolved for iCare id=${id} — skipping bell push`);
      return;
    }

    try {
      await pushBellNotification({
        category: 'icare',
        type: 'created',
        title: `New iCare Case — ${record.urgency}`,
        message: `${staffLabel} — ${record.reason}`,
        link: `/i-care?icare=${id}`,
        source_id: id,
        recipients: [...recipients],
      });
    } catch (err: any) {
      this.logger.error(`❌ Failed to push 'created' bell notification for id=${id}`, err?.message || err);
    }
  }

  /**
   * Triggers para el evento 'justified' — 4 envíos separados por rol.
   * justified_staff       → staff_name (el staff del iCare)
   * justified_coordinator → coordinator(s)
   * justified_hr          → role 'hr'
   * justified_management  → role 'management'
   */
  private async triggerJustifiedEmails(id: string, record: ICare): Promise<void> {
    const [hrEmails, managementEmails, hrAssistantEmails] = await Promise.all([
      this.getEmailsByRole('hr'),
      this.getEmailsByRole('management'),
      this.getEmailsByAnyRole('hr-assistant'),
    ]);
    const allHrEmails = [...hrEmails, ...hrAssistantEmails];
    const staffEmail = record.staff_name?.nova_email ?? null;
    const coordinatorEmails = (record.responsible ?? []).map(r => r.nova_email).filter(Boolean);
    const isHighCritical = record.urgency === ICareUrgency.HIGH || record.urgency === ICareUrgency.CRITICAL;
    const isCoordinatorCase = record.staff_name?.is_coordinator === true;

    const sends: Promise<void>[] = [];
    if (staffEmail) sends.push(this.triggerEmail(id, 'justified_staff', [staffEmail]));
    if (coordinatorEmails.length > 0 && !isHighCritical && !isCoordinatorCase) sends.push(this.triggerEmail(id, 'justified_coordinator', coordinatorEmails));
    if (allHrEmails.length > 0) sends.push(this.triggerEmail(id, 'justified_hr', allHrEmails));
    if (managementEmails.length > 0 && isHighCritical) sends.push(this.triggerEmail(id, 'justified_management', managementEmails));
    await Promise.all(sends);
  }

  /**
   * Trigger para el evento 'committed'.
   * Destinatarios: staff_name + coordinator(s) + role 'hr' + role 'management'.
   * Solo se llama cuando committed=true.
   * 4 envíos separados por rol:
   *   committed_staff       → staff_name (confirmación)
   *   committed_coordinator → coordinator(s)
   *   committed_hr          → role 'hr'
   *   committed_management  → role 'management'
   */
  private async triggerCommittedEmails(id: string, record: ICare): Promise<void> {
    const [hrEmails, managementEmails, hrAssistantEmails] = await Promise.all([
      this.getEmailsByRole('hr'),
      this.getEmailsByRole('management'),
      this.getEmailsByAnyRole('hr-assistant'),
    ]);
    const allHrEmails = [...hrEmails, ...hrAssistantEmails];
    const staffEmail = record.staff_name?.nova_email ?? null;
    const coordinatorEmails = (record.responsible ?? []).map(r => r.nova_email).filter(Boolean);
    const isHighCritical = record.urgency === ICareUrgency.HIGH || record.urgency === ICareUrgency.CRITICAL;
    const isCoordinatorCase = record.staff_name?.is_coordinator === true;

    const sends: Promise<void>[] = [];
    if (staffEmail) sends.push(this.triggerEmail(id, 'committed_staff', [staffEmail]));
    if (coordinatorEmails.length > 0 && !isHighCritical && !isCoordinatorCase) sends.push(this.triggerEmail(id, 'committed_coordinator', coordinatorEmails));
    if (allHrEmails.length > 0) sends.push(this.triggerEmail(id, 'committed_hr', allHrEmails));
    if (managementEmails.length > 0 && isHighCritical) sends.push(this.triggerEmail(id, 'committed_management', managementEmails));
    await Promise.all(sends);
  }

  private async triggerResolvedEmails(id: string, record: ICare): Promise<void> {
    const [hrEmails, managementEmails, hrAssistantEmails] = await Promise.all([
      this.getEmailsByRole('hr'),
      this.getEmailsByRole('management'),
      this.getEmailsByAnyRole('hr-assistant'),
    ]);
    const allHrEmails = [...hrEmails, ...hrAssistantEmails];
    const staffEmail = record.staff_name?.nova_email ?? null;
    const coordinatorEmails = (record.responsible ?? []).map(r => r.nova_email).filter(Boolean);
    const isHighCritical = record.urgency === ICareUrgency.HIGH || record.urgency === ICareUrgency.CRITICAL;
    const isCoordinatorCase = record.staff_name?.is_coordinator === true;
    const sends: Promise<void>[] = [];
    if (staffEmail) sends.push(this.triggerEmail(id, 'resolved_staff', [staffEmail]));
    if (coordinatorEmails.length > 0 && !isHighCritical && !isCoordinatorCase) sends.push(this.triggerEmail(id, 'resolved_coordinator', coordinatorEmails));
    if (allHrEmails.length > 0) sends.push(this.triggerEmail(id, 'resolved_hr', allHrEmails));
    if (managementEmails.length > 0 && isHighCritical) sends.push(this.triggerEmail(id, 'resolved_management', managementEmails));
    await Promise.all(sends);
  }

  /**
   * Campana -- mismo evento que triggerResolvedEmails de arriba (HR/Mgmt/
   * SuperCoordinator resuelve un caso commit_fulfilled -> solved, el
   * ultimo paso del flujo). Mismos 2 criterios que los eventos anteriores
   * (created/coaching_session_completed/seguimiento_added): coordinator/
   * HR/management SIEMPRE sin gate de urgency, y el actor (quien resolvio)
   * excluido de sus propios destinatarios. `resolved_by` ya queda en el
   * record recien guardado (igual que commit_approved_by/commit_fulfilled_by).
   */
  private async triggerResolvedBellNotification(id: string, record: ICare): Promise<void> {
    const isCoordinatorCase = record.staff_name?.is_coordinator === true;
    const staffLabel = `${record.staff_name?.name ?? ''} ${record.staff_name?.last_name ?? ''}`.trim() || 'a staff member';
    const actorRef = record.resolved_by;
    const actorNumber = actorRef?.employee_number;
    const actorLabel = actorRef ? `${actorRef.name ?? ''} ${actorRef.last_name ?? ''}`.trim() : 'HR';

    // HR/Management/HR-Assistant via EmployeesV2Service.findByRoles() --
    // ver JSDoc de resolveEmployeeNumbersViaEmployeesV2() mas arriba para el
    // historial completo (2 intentos previos descartados).
    const [allHrNumbers, mgmtNumbers] = await Promise.all([
      this.resolveEmployeeNumbersViaEmployeesV2(['hr', 'hr-assistant']),
      this.resolveEmployeeNumbersViaEmployeesV2(['management']),
    ]);
    this.logger.log(`[bell:${id}] hr/hr-assistant resolved=${allHrNumbers.length} [${allHrNumbers.join(',')}] management resolved=${mgmtNumbers.length} [${mgmtNumbers.join(',')}]`);

    const recipients = new Set<string>(allHrNumbers);
    mgmtNumbers.forEach(n => recipients.add(n));
    if (!isCoordinatorCase) {
      (record.responsible ?? []).forEach(r => { if (r?.employee_number) recipients.add(r.employee_number); });
    }
    if (actorNumber) recipients.delete(actorNumber);

    if (recipients.size > 0) {
      try {
        await pushBellNotification({
          category: 'icare',
          type: 'resolved',
          title: `iCare Case Solved — ${record.urgency}`,
          message: `${actorLabel} resolved the case for ${staffLabel}.`,
          link: `/i-care?icare=${id}`,
          source_id: id,
          recipients: [...recipients],
        });
      } catch (err: any) {
        this.logger.error(`❌ Failed to push 'resolved' admin bell notification for id=${id}`, err?.message || err);
      }
    } else {
      this.logger.warn(`[triggerResolvedBellNotification] no admin recipients resolved for iCare id=${id}`);
    }

    const staffNumber = record.staff_name?.employee_number;
    if (staffNumber && staffNumber !== actorNumber) {
      try {
        await pushBellNotification({
          category: 'icare',
          type: 'resolved',
          title: `iCare Case Solved (${record.urgency})`,
          message: `${actorLabel} resolved your case.`,
          link: `/my-i-care?icare=${id}`,
          source_id: id,
          recipients: [staffNumber],
        });
      } catch (err: any) {
        this.logger.error(`❌ Failed to push 'resolved' staff bell notification for id=${id}`, err?.message || err);
      }
    }
  }

  private async triggerSeguimientoAddedEmails(id: string, record: ICare): Promise<void> {
    const [hrEmails, managementEmails, hrAssistantEmails] = await Promise.all([
      this.getEmailsByRole('hr'),
      this.getEmailsByRole('management'),
      this.getEmailsByAnyRole('hr-assistant'),
    ]);
    const allHrEmails = [...hrEmails, ...hrAssistantEmails];
    const staffEmail = record.staff_name?.nova_email ?? null;
    const coordinatorEmails = (record.responsible ?? []).map(r => r.nova_email).filter(Boolean);
    const isHighCritical = record.urgency === ICareUrgency.HIGH || record.urgency === ICareUrgency.CRITICAL;
    const isCoordinatorCase = record.staff_name?.is_coordinator === true;
    const sends: Promise<void>[] = [];
    if (staffEmail) sends.push(this.triggerEmail(id, 'seguimiento_added_staff', [staffEmail]));
    if (coordinatorEmails.length > 0 && !isHighCritical && !isCoordinatorCase) sends.push(this.triggerEmail(id, 'seguimiento_added_coordinator', coordinatorEmails));
    if (allHrEmails.length > 0) sends.push(this.triggerEmail(id, 'seguimiento_added_hr', allHrEmails));
    if (managementEmails.length > 0 && isHighCritical) sends.push(this.triggerEmail(id, 'seguimiento_added_management', managementEmails));
    await Promise.all(sends);
  }

  /**
   * Campana -- mismo evento que triggerSeguimientoAddedEmails de arriba
   * (follow-up agregado: sea el primero via approveCommit() FUERA del
   * bundle de Coaching Session, o uno posterior via addSeguimiento() --
   * seguimientoDialog, que puede llamarse varias veces en loop mientras el
   * caso sigue FOLLOWING_UP). Misma resolucion de destinatarios que el
   * email, con los mismos 2 criterios ya aplicados a
   * 'created'/'coaching_session_completed':
   *  1) coordinator/HR/management van SIEMPRE, sin gate de urgency.
   *  2) el coordinator que agrego ESTE seguimiento se excluye de sus
   *     propios destinatarios. El actor se recibe como parametro (no se
   *     puede leer de un campo fijo del record como en coaching session:
   *     approveCommit usa dto.approved_by, addSeguimiento usa dto.added_by).
   */
  private async triggerSeguimientoAddedBellNotification(
    id: string,
    record: ICare,
    actor?: { employee_number: string; name: string; last_name: string } | null,
  ): Promise<void> {
    const isCoordinatorCase = record.staff_name?.is_coordinator === true;
    const staffLabel = `${record.staff_name?.name ?? ''} ${record.staff_name?.last_name ?? ''}`.trim() || 'a staff member';
    const actorNumber = actor?.employee_number;
    const actorLabel = actor ? `${actor.name ?? ''} ${actor.last_name ?? ''}`.trim() : 'A coordinator';

    // HR/Management/HR-Assistant via EmployeesV2Service.findByRoles() --
    // ver JSDoc de resolveEmployeeNumbersViaEmployeesV2() mas arriba para el
    // historial completo (2 intentos previos descartados).
    const [allHrNumbers, mgmtNumbers] = await Promise.all([
      this.resolveEmployeeNumbersViaEmployeesV2(['hr', 'hr-assistant']),
      this.resolveEmployeeNumbersViaEmployeesV2(['management']),
    ]);
    this.logger.log(`[bell:${id}] hr/hr-assistant resolved=${allHrNumbers.length} [${allHrNumbers.join(',')}] management resolved=${mgmtNumbers.length} [${mgmtNumbers.join(',')}]`);

    const recipients = new Set<string>(allHrNumbers);
    mgmtNumbers.forEach(n => recipients.add(n));
    if (!isCoordinatorCase) {
      (record.responsible ?? []).forEach(r => { if (r?.employee_number) recipients.add(r.employee_number); });
    }
    if (actorNumber) recipients.delete(actorNumber);

    if (recipients.size > 0) {
      try {
        await pushBellNotification({
          category: 'icare',
          type: 'seguimiento_added',
          title: `Follow-up Added — ${record.urgency}`,
          message: `${actorLabel} recorded a new follow-up for ${staffLabel}.`,
          link: `/i-care?icare=${id}`,
          source_id: id,
          recipients: [...recipients],
        });
      } catch (err: any) {
        this.logger.error(`❌ Failed to push 'seguimiento_added' admin bell notification for id=${id}`, err?.message || err);
      }
    } else {
      this.logger.warn(`[triggerSeguimientoAddedBellNotification] no admin recipients resolved for iCare id=${id}`);
    }

    const staffNumber = record.staff_name?.employee_number;
    if (staffNumber && staffNumber !== actorNumber) {
      try {
        await pushBellNotification({
          category: 'icare',
          type: 'seguimiento_added',
          title: `Follow-up Added (${record.urgency})`,
          message: `${actorLabel} recorded a new follow-up for your case.`,
          link: `/my-i-care?icare=${id}`,
          source_id: id,
          recipients: [staffNumber],
        });
      } catch (err: any) {
        this.logger.error(`❌ Failed to push 'seguimiento_added' staff bell notification for id=${id}`, err?.message || err);
      }
    }
  }

  private async triggerCommitFulfilledEmails(id: string, record: ICare): Promise<void> {
    const [hrEmails, managementEmails, hrAssistantEmails] = await Promise.all([
      this.getEmailsByRole('hr'),
      this.getEmailsByRole('management'),
      this.getEmailsByAnyRole('hr-assistant'),
    ]);
    const allHrEmails = [...hrEmails, ...hrAssistantEmails];
    const staffEmail = record.staff_name?.nova_email ?? null;
    const coordinatorEmails = (record.responsible ?? []).map(r => r.nova_email).filter(Boolean);
    const isHighCritical = record.urgency === ICareUrgency.HIGH || record.urgency === ICareUrgency.CRITICAL;
    const isCoordinatorCase = record.staff_name?.is_coordinator === true;
    const sends: Promise<void>[] = [];
    if (staffEmail) sends.push(this.triggerEmail(id, 'commit_fulfilled_staff', [staffEmail]));
    if (coordinatorEmails.length > 0 && !isHighCritical && !isCoordinatorCase) sends.push(this.triggerEmail(id, 'commit_fulfilled_coordinator', coordinatorEmails));
    if (allHrEmails.length > 0) sends.push(this.triggerEmail(id, 'commit_fulfilled_hr', allHrEmails));
    if (managementEmails.length > 0 && isHighCritical) sends.push(this.triggerEmail(id, 'commit_fulfilled_management', managementEmails));
    await Promise.all(sends);
  }

  /**
   * Campana -- mismo evento que triggerCommitFulfilledEmails de arriba
   * (fulfill STANDALONE, fuera del bundle de Coaching Session -- ej. un
   * caso en following_up que se marca fulfilled directamente desde
   * seguimientoDialog). Mismos 2 criterios que los demas eventos:
   * coordinator/HR/management SIEMPRE sin gate de urgency, y el actor
   * (quien marco fulfilled) excluido de sus propios destinatarios.
   * `commit_fulfilled_by` ya queda en el record recien guardado.
   */
  private async triggerCommitFulfilledBellNotification(id: string, record: ICare): Promise<void> {
    const isCoordinatorCase = record.staff_name?.is_coordinator === true;
    const staffLabel = `${record.staff_name?.name ?? ''} ${record.staff_name?.last_name ?? ''}`.trim() || 'a staff member';
    const actorRef = record.commit_fulfilled_by;
    const actorNumber = actorRef?.employee_number;
    const actorLabel = actorRef ? `${actorRef.name ?? ''} ${actorRef.last_name ?? ''}`.trim() : 'A coordinator';

    // HR/Management/HR-Assistant via EmployeesV2Service.findByRoles() --
    // ver JSDoc de resolveEmployeeNumbersViaEmployeesV2() mas arriba para el
    // historial completo (2 intentos previos descartados).
    const [allHrNumbers, mgmtNumbers] = await Promise.all([
      this.resolveEmployeeNumbersViaEmployeesV2(['hr', 'hr-assistant']),
      this.resolveEmployeeNumbersViaEmployeesV2(['management']),
    ]);
    this.logger.log(`[bell:${id}] hr/hr-assistant resolved=${allHrNumbers.length} [${allHrNumbers.join(',')}] management resolved=${mgmtNumbers.length} [${mgmtNumbers.join(',')}]`);

    const recipients = new Set<string>(allHrNumbers);
    mgmtNumbers.forEach(n => recipients.add(n));
    if (!isCoordinatorCase) {
      (record.responsible ?? []).forEach(r => { if (r?.employee_number) recipients.add(r.employee_number); });
    }
    if (actorNumber) recipients.delete(actorNumber);

    if (recipients.size > 0) {
      try {
        await pushBellNotification({
          category: 'icare',
          type: 'commit_fulfilled',
          title: `Commit Fulfilled — ${record.urgency}`,
          message: `${actorLabel} marked the commitment fulfilled for ${staffLabel}.`,
          link: `/i-care?icare=${id}`,
          source_id: id,
          recipients: [...recipients],
        });
      } catch (err: any) {
        this.logger.error(`❌ Failed to push 'commit_fulfilled' admin bell notification for id=${id}`, err?.message || err);
      }
    } else {
      this.logger.warn(`[triggerCommitFulfilledBellNotification] no admin recipients resolved for iCare id=${id}`);
    }

    const staffNumber = record.staff_name?.employee_number;
    if (staffNumber && staffNumber !== actorNumber) {
      try {
        await pushBellNotification({
          category: 'icare',
          type: 'commit_fulfilled',
          title: `Commit Fulfilled (${record.urgency})`,
          message: `${actorLabel} marked your commitment as fulfilled.`,
          link: `/my-i-care?icare=${id}`,
          source_id: id,
          recipients: [staffNumber],
        });
      } catch (err: any) {
        this.logger.error(`❌ Failed to push 'commit_fulfilled' staff bell notification for id=${id}`, err?.message || err);
      }
    }
  }

  /**
   * 2026-08-23: dispara UN solo evento — 'coaching_session_completed_*' —
   * cuando approveCommit()/fulfillCommit() son el último paso del bundle de
   * Coaching Session (dto.coaching_session_bundle === true). Reemplaza,
   * para ese caso, a 'seguimiento_added_*'/'commit_fulfilled_*' — el
   * usuario pidió explícitamente que el correo diga "Coaching Session",
   * no "Follow-up", porque son conceptos distintos (la coaching session es
   * el evento de hoy; un follow-up real es algo que pasa DESPUÉS, por
   * separado, vía seguimientoDialog/addSeguimiento()).
   * Misma resolución de destinatarios que el resto de los triggers.
   */
  private async triggerCoachingSessionCompletedEmails(id: string, record: ICare): Promise<void> {
    const [hrEmails, managementEmails, hrAssistantEmails] = await Promise.all([
      this.getEmailsByRole('hr'),
      this.getEmailsByRole('management'),
      this.getEmailsByAnyRole('hr-assistant'),
    ]);
    const allHrEmails = [...hrEmails, ...hrAssistantEmails];
    const staffEmail = record.staff_name?.nova_email ?? null;
    const coordinatorEmails = (record.responsible ?? []).map(r => r.nova_email).filter(Boolean);
    const isHighCritical = record.urgency === ICareUrgency.HIGH || record.urgency === ICareUrgency.CRITICAL;
    const isCoordinatorCase = record.staff_name?.is_coordinator === true;
    const sends: Promise<void>[] = [];
    if (staffEmail) sends.push(this.triggerEmail(id, 'coaching_session_completed_staff', [staffEmail]));
    if (coordinatorEmails.length > 0 && !isHighCritical && !isCoordinatorCase) sends.push(this.triggerEmail(id, 'coaching_session_completed_coordinator', coordinatorEmails));
    if (allHrEmails.length > 0) sends.push(this.triggerEmail(id, 'coaching_session_completed_hr', allHrEmails));
    if (managementEmails.length > 0 && isHighCritical) sends.push(this.triggerEmail(id, 'coaching_session_completed_management', managementEmails));
    await Promise.all(sends);
  }

  /**
   * Campana -- mismo evento que triggerCoachingSessionCompletedEmails de
   * arriba (cierre del bundle de Coaching Session, sea via approveCommit
   * con seguimiento o via fulfillCommit directo). Misma resolucion de
   * destinatarios que el email, con 2 diferencias deliberadas (pedido
   * explicito 2026-08-28, mismo criterio ya aplicado en 'created' -- ver
   * triggerCreatedBellNotification):
   *  1) coordinator/HR/management van SIEMPRE, sin gate de urgency.
   *  2) el coordinator que HIZO la coaching session (commit_approved_by o
   *     commit_fulfilled_by, segun cual de las 2 llamadas cerro el bundle)
   *     se excluye de sus propios destinatarios -- no tiene sentido
   *     notificarlo de su propia accion (pedido explicito del usuario).
   */
  private async triggerCoachingSessionBellNotification(id: string, record: ICare): Promise<void> {
    const isCoordinatorCase = record.staff_name?.is_coordinator === true;
    const staffLabel = `${record.staff_name?.name ?? ''} ${record.staff_name?.last_name ?? ''}`.trim() || 'a staff member';

    // Solo uno de los 2 corrio para cerrar el bundle, asi que solo uno de
    // estos 2 campos viene poblado en el record recien guardado.
    const actorRef = record.commit_fulfilled_by ?? record.commit_approved_by;
    const actorNumber = actorRef?.employee_number;
    const actorLabel = actorRef ? `${actorRef.name ?? ''} ${actorRef.last_name ?? ''}`.trim() : 'A coordinator';

    // HR/Management/HR-Assistant via EmployeesV2Service.findByRoles() --
    // ver JSDoc de resolveEmployeeNumbersViaEmployeesV2() mas arriba para el
    // historial completo (2 intentos previos descartados).
    const [allHrNumbers, mgmtNumbers] = await Promise.all([
      this.resolveEmployeeNumbersViaEmployeesV2(['hr', 'hr-assistant']),
      this.resolveEmployeeNumbersViaEmployeesV2(['management']),
    ]);
    this.logger.log(`[bell:${id}] hr/hr-assistant resolved=${allHrNumbers.length} [${allHrNumbers.join(',')}] management resolved=${mgmtNumbers.length} [${mgmtNumbers.join(',')}]`);

    const recipients = new Set<string>(allHrNumbers);
    mgmtNumbers.forEach(n => recipients.add(n));
    if (!isCoordinatorCase) {
      (record.responsible ?? []).forEach(r => { if (r?.employee_number) recipients.add(r.employee_number); });
    }
    if (actorNumber) recipients.delete(actorNumber);

    if (recipients.size > 0) {
      try {
        await pushBellNotification({
          category: 'icare',
          type: 'coaching_session_completed',
          title: `Coaching Session Completed — ${record.urgency}`,
          message: `${actorLabel} completed a coaching session with ${staffLabel}.`,
          link: `/i-care?icare=${id}`,
          source_id: id,
          recipients: [...recipients],
        });
      } catch (err: any) {
        this.logger.error(`❌ Failed to push 'coaching_session_completed' admin bell notification for id=${id}`, err?.message || err);
      }
    } else {
      this.logger.warn(`[triggerCoachingSessionBellNotification] no admin recipients resolved for iCare id=${id}`);
    }

    const staffNumber = record.staff_name?.employee_number;
    if (staffNumber && staffNumber !== actorNumber) {
      try {
        await pushBellNotification({
          category: 'icare',
          type: 'coaching_session_completed',
          title: `Coaching Session Completed (${record.urgency})`,
          message: `${actorLabel} completed a coaching session with you.`,
          link: `/my-i-care?icare=${id}`,
          source_id: id,
          recipients: [staffNumber],
        });
      } catch (err: any) {
        this.logger.error(`❌ Failed to push 'coaching_session_completed' staff bell notification for id=${id}`, err?.message || err);
      }
    }
  }

  private async triggerCoordinatorRejectedEmails(id: string, record: ICare): Promise<void> {
    // Include both the responsible coordinators AND the one who performed the rejection
    const responsibleEmails = (record.responsible ?? []).map(r => r.nova_email).filter(Boolean);
    const rejectorEmail = record.coordinator_rejected_by?.nova_email;
    const coordinatorEmails = [...new Set([...responsibleEmails, ...(rejectorEmail ? [rejectorEmail] : [])])];
    const [hrEmails, managementEmails, hrAssistantEmails] = await Promise.all([
      this.getEmailsByRole('hr'),
      this.getEmailsByRole('management'),
      this.getEmailsByAnyRole('hr-assistant'),
    ]);
    const allHrEmails = [...hrEmails, ...hrAssistantEmails];
    const sends: Promise<void>[] = [];
    if (coordinatorEmails.length > 0) sends.push(this.triggerEmail(id, 'coordinator_rejected_coordinator', coordinatorEmails));
    if (allHrEmails.length > 0) sends.push(this.triggerEmail(id, 'coordinator_rejected_hr', allHrEmails));
    if (managementEmails.length > 0 && ICareService.isHighCriticalUrgency(record)) sends.push(this.triggerEmail(id, 'coordinator_rejected_management', managementEmails));
    await Promise.all(sends);
  }

  /**
   * Campana -- mismo evento que triggerCoordinatorRejectedEmails de arriba
   * (coordinator rechaza un pending -> rejection_under_review, para
   * revision de HR/Mgmt). NO hay push a staff -- no existe
   * 'coordinator_rejected_staff' en el email tampoco; el staff reportado
   * no se entera de este paso interno, solo mas adelante segun como se
   * resuelva la revision.
   *
   * 2026-08-30: a diferencia del email (que SI incluye al coordinator que
   * rechazo, ver comentario en triggerCoordinatorRejectedEmails), la campana
   * EXCLUYE al actor -- pedido explicito del usuario: "si yo como coordinator
   * rechazo a mi no me debe llegar la notification, a los otros si". El resto
   * de responsible[] (los demas coordinators del staff) SI la reciben, igual
   * que HR/HR-assistant/Management.
   *
   * Unico criterio que SI diverge del email (mismo patron que el resto de
   * esta ronda): management va SIEMPRE, sin el gate de
   * isHighCriticalUrgency que tiene el email.
   *
   * 2026-08-31: HALLAZGO -- existe un SEGUNDO punto de entrada para este mismo
   * evento de negocio. justify() con dto.justified=false (el toggle "Reject"
   * dentro del dialog de Justify, distinto del dialog dedicado "Coordinator
   * Reject" que llama a coordinatorReject()) TAMBIEN deja el record en
   * REJECTION_UNDER_REVIEW y dispara triggerCoordinatorRejectedEmails -- pero
   * esa rama nunca setea record.coordinator_rejected_by (ese campo solo lo
   * llena coordinatorReject()). Por eso el actor ahora se recibe como
   * parametro explicito (`rejectedBy`) en vez de leerse de
   * record.coordinator_rejected_by: coordinatorReject() pasa
   * record.coordinator_rejected_by, justify() pasa dto.approved_by.
   */
  private async triggerCoordinatorRejectedBellNotification(
    id: string,
    record: ICare,
    rejectedBy?: { name?: string; last_name?: string; employee_number?: string },
  ): Promise<void> {
    this.logger.log(`[bell:${id}] triggerCoordinatorRejectedBellNotification() invoked`);
    const responsibleNumbers = (record.responsible ?? []).map(r => r.employee_number).filter(Boolean);
    const rejectorNumber = rejectedBy?.employee_number;
    // El actor (coordinator que rechazo) queda EXCLUIDO -- ya sabe lo que hizo.
    const coordinatorNumbers = responsibleNumbers.filter((n) => n !== rejectorNumber);

    // HR/Management/HR-Assistant via EmployeesV2Service.findByRoles() --
    // ver JSDoc de resolveEmployeeNumbersViaEmployeesV2() mas arriba para el
    // historial completo (2 intentos previos descartados).
    const [allHrNumbers, mgmtNumbers] = await Promise.all([
      this.resolveEmployeeNumbersViaEmployeesV2(['hr', 'hr-assistant']),
      this.resolveEmployeeNumbersViaEmployeesV2(['management']),
    ]);
    this.logger.log(`[bell:${id}] hr/hr-assistant resolved=${allHrNumbers.length} [${allHrNumbers.join(',')}] management resolved=${mgmtNumbers.length} [${mgmtNumbers.join(',')}]`);

    const recipients = new Set<string>([...allHrNumbers, ...mgmtNumbers, ...coordinatorNumbers]);
    this.logger.log(`[bell:${id}] final recipients (${recipients.size}): [${[...recipients].join(', ')}]`);

    if (recipients.size === 0) {
      this.logger.warn(`[triggerCoordinatorRejectedBellNotification] no recipients resolved for iCare id=${id}`);
      return;
    }

    const staffLabel = `${record.staff_name?.name ?? ''} ${record.staff_name?.last_name ?? ''}`.trim() || 'a staff member';
    const rejectorLabel = rejectedBy
      ? `${rejectedBy.name ?? ''} ${rejectedBy.last_name ?? ''}`.trim()
      : 'A coordinator';

    try {
      await pushBellNotification({
        category: 'icare',
        type: 'coordinator_rejected',
        title: `Coordinator Rejected iCare Case — ${record.urgency}`,
        message: `${rejectorLabel} rejected the case for ${staffLabel} — pending your review.`,
        link: `/i-care?icare=${id}`,
        source_id: id,
        recipients: [...recipients],
      });
    } catch (err: any) {
      this.logger.error(`❌ Failed to push 'coordinator_rejected' bell notification for id=${id}`, err?.message || err);
    }
  }

  private async triggerRejectionReviewedEmails(id: string, record: ICare, accepted: boolean): Promise<void> {
    const coordinatorEmails = (record.responsible ?? []).map(r => r.nova_email).filter(Boolean);
    const sends: Promise<void>[] = [];
    const reviewerEmail = record.rejection_reviewed_by?.nova_email;
    const [hrEmails, managementEmails, hrAssistantEmails] = await Promise.all([
      this.getEmailsByRole('hr'),
      this.getEmailsByRole('management'),
      this.getEmailsByAnyRole('hr-assistant'),
    ]);
    const allHrEmails = [...hrEmails, ...hrAssistantEmails];
    if (accepted) {
      // Confirmación personal al reviewer
      if (reviewerEmail) sends.push(this.triggerEmail(id, 'rejection_review_accepted_reviewer', [reviewerEmail]));
      if (coordinatorEmails.length > 0) sends.push(this.triggerEmail(id, 'rejection_review_accepted_coordinator', coordinatorEmails));
      if (allHrEmails.length > 0) sends.push(this.triggerEmail(id, 'rejection_review_accepted_hr', allHrEmails));
      if (managementEmails.length > 0 && ICareService.isHighCriticalUrgency(record)) sends.push(this.triggerEmail(id, 'rejection_review_accepted_management', managementEmails));
    } else {
      const staffEmail = record.staff_name?.nova_email;
      // Confirmación personal al reviewer
      if (reviewerEmail) sends.push(this.triggerEmail(id, 'rejection_review_overridden_reviewer', [reviewerEmail]));
      if (staffEmail) sends.push(this.triggerEmail(id, 'rejection_review_overridden_staff', [staffEmail]));
      if (coordinatorEmails.length > 0) sends.push(this.triggerEmail(id, 'rejection_review_overridden_coordinator', coordinatorEmails));
      if (allHrEmails.length > 0) sends.push(this.triggerEmail(id, 'rejection_review_overridden_hr', allHrEmails));
      if (managementEmails.length > 0 && ICareService.isHighCriticalUrgency(record)) sends.push(this.triggerEmail(id, 'rejection_review_overridden_management', managementEmails));
    }
    await Promise.all(sends);
  }

  /**
   * Campana -- mismo evento que triggerRejectionReviewedEmails de arriba (HR/Mgmt
   * revisa el rejected del coordinator: accept=true -> REJECTED definitivo;
   * accept=false -> override, vuelve a PENDING con el coordinator).
   * Pedido explicito del usuario: en AMBAS ramas debe llegar a los coordinators.
   * 2026-08-30 (2do ajuste, mismo dia -- el usuario reporto que HR/Management no
   * la recibian): se suman HR/HR-assistant/Management, igual que el email
   * (`triggerRejectionReviewedEmails` los notifica siempre en ambas ramas). El
   * reviewer (actor de este paso) se excluye -- mismo criterio de exclusion de
   * actor que created/resolved/seguimiento_added/commit_fulfilled/coaching_session.
   * NO se notifica al staff por esta via (el email si lo hace en el override).
   */
  private async triggerRejectionReviewedBellNotification(id: string, record: ICare, accepted: boolean): Promise<void> {
    this.logger.log(`[bell:${id}] triggerRejectionReviewedBellNotification() invoked, accepted=${accepted}`);
    const coordinatorNumbers = (record.responsible ?? []).map(r => r.employee_number).filter(Boolean);
    const reviewerNumber = record.rejection_reviewed_by?.employee_number;

    // HR/Management/HR-Assistant via EmployeesV2Service.findByRoles() --
    // ver JSDoc de resolveEmployeeNumbersViaEmployeesV2() mas arriba para el
    // historial completo (2 intentos previos descartados).
    const [allHrNumbers, mgmtNumbers] = await Promise.all([
      this.resolveEmployeeNumbersViaEmployeesV2(['hr', 'hr-assistant']),
      this.resolveEmployeeNumbersViaEmployeesV2(['management']),
    ]);
    this.logger.log(`[bell:${id}] hr/hr-assistant resolved=${allHrNumbers.length} [${allHrNumbers.join(',')}] management resolved=${mgmtNumbers.length} [${mgmtNumbers.join(',')}]`);

    const recipients = new Set<string>([...allHrNumbers, ...mgmtNumbers, ...coordinatorNumbers]);
    if (reviewerNumber) recipients.delete(reviewerNumber);
    this.logger.log(`[bell:${id}] final recipients (${recipients.size}): [${[...recipients].join(', ')}]`);

    if (recipients.size === 0) {
      this.logger.warn(`[triggerRejectionReviewedBellNotification] no recipients resolved for iCare id=${id}`);
      return;
    }

    const staffLabel = `${record.staff_name?.name ?? ''} ${record.staff_name?.last_name ?? ''}`.trim() || 'a staff member';
    const reviewerLabel = record.rejection_reviewed_by
      ? `${record.rejection_reviewed_by.name ?? ''} ${record.rejection_reviewed_by.last_name ?? ''}`.trim()
      : 'HR/Management';

    const type = accepted ? 'rejection_review_accepted' : 'rejection_review_overridden';
    const title = accepted ? `Rejection Confirmed — ${record.urgency}` : `Rejection Overridden — ${record.urgency}`;
    const message = accepted
      ? `${reviewerLabel} confirmed the rejection for ${staffLabel}.`
      : `${reviewerLabel} overrode the rejection for ${staffLabel} — the case is back with you.`;

    try {
      await pushBellNotification({
        category: 'icare',
        type,
        title,
        message,
        link: `/i-care?icare=${id}`,
        source_id: id,
        recipients: [...recipients],
      });
    } catch (err: any) {
      this.logger.error(`❌ Failed to push '${type}' bell notification for id=${id}`, err?.message || err);
    }
  }

  private async triggerHrRejectedEmails(id: string, record: ICare): Promise<void> {
    const [hrEmails, managementEmails, hrAssistantEmails] = await Promise.all([
      this.getEmailsByRole('hr'),
      this.getEmailsByRole('management'),
      this.getEmailsByAnyRole('hr-assistant'),
    ]);
    const allHrEmails = [...hrEmails, ...hrAssistantEmails];
    const sends: Promise<void>[] = [];
    if (allHrEmails.length > 0) sends.push(this.triggerEmail(id, 'hr_rejected_hr', allHrEmails));
    if (managementEmails.length > 0 && ICareService.isHighCriticalUrgency(record)) sends.push(this.triggerEmail(id, 'hr_rejected_management', managementEmails));
    await Promise.all(sends);
  }

  /**
   * 2026-08-27: aviso informativo (NO bloqueante) a HR/Mgmt + coordinator
   * cuando un coordinator (o super-coordinator) justifica un High/Critical
   * directamente. Reemplaza a triggerPendingHrReviewEmails en este punto --
   * ya no hay nada que aprobar/rechazar, es solo visibilidad/auditoria.
   */
  private async triggerHcHandledByCoordinatorEmails(id: string, record: ICare): Promise<void> {
    const coordinatorEmails = (record.responsible ?? []).map(r => r.nova_email).filter(Boolean);
    const [hrEmails, managementEmails, hrAssistantEmails] = await Promise.all([
      this.getEmailsByRole('hr'),
      this.getEmailsByRole('management'),
      this.getEmailsByAnyRole('hr-assistant'),
    ]);
    const allHrEmails = [...hrEmails, ...hrAssistantEmails];
    const sends: Promise<void>[] = [];
    if (coordinatorEmails.length > 0) sends.push(this.triggerEmail(id, 'hc_handled_by_coordinator_coordinator', coordinatorEmails));
    if (allHrEmails.length > 0) sends.push(this.triggerEmail(id, 'hc_handled_by_coordinator_hr', allHrEmails));
    if (managementEmails.length > 0) sends.push(this.triggerEmail(id, 'hc_handled_by_coordinator_management', managementEmails));
    await Promise.all(sends);
  }

  private async triggerPendingHrReviewEmails(id: string, record: ICare): Promise<void> {
    const responsibleEmails = (record.responsible ?? []).map(r => r.nova_email).filter(Boolean);
    const submitterEmail = record.justified_approved_by?.nova_email;
    const coordinatorEmails = [...new Set([...responsibleEmails, ...(submitterEmail ? [submitterEmail] : [])])];
    const [hrEmails, managementEmails, hrAssistantEmails] = await Promise.all([
      this.getEmailsByRole('hr'),
      this.getEmailsByRole('management'),
      this.getEmailsByAnyRole('hr-assistant'),
    ]);
    const allHrEmails = [...hrEmails, ...hrAssistantEmails];
    const sends: Promise<void>[] = [];
    if (coordinatorEmails.length > 0) sends.push(this.triggerEmail(id, 'pending_hr_review_coordinator', coordinatorEmails));
    if (allHrEmails.length > 0) sends.push(this.triggerEmail(id, 'pending_hr_review_hr', allHrEmails));
    if (managementEmails.length > 0 && ICareService.isHighCriticalUrgency(record)) sends.push(this.triggerEmail(id, 'pending_hr_review_management', managementEmails));
    await Promise.all(sends);
  }

  private async triggerHcAcceptedEmails(id: string, record: ICare): Promise<void> {
    const staffEmail = record.staff_name?.nova_email;
    const [hrEmails, managementEmails, hrAssistantEmails] = await Promise.all([
      this.getEmailsByRole('hr'),
      this.getEmailsByRole('management'),
      this.getEmailsByAnyRole('hr-assistant'),
    ]);
    const allHrEmails = [...hrEmails, ...hrAssistantEmails];
    const sends: Promise<void>[] = [];
    if (staffEmail) sends.push(this.triggerEmail(id, 'hc_accepted_staff', [staffEmail]));
    if (allHrEmails.length > 0) sends.push(this.triggerEmail(id, 'hc_accepted_hr', allHrEmails));
    if (managementEmails.length > 0 && ICareService.isHighCriticalUrgency(record)) sends.push(this.triggerEmail(id, 'hc_accepted_management', managementEmails));
    await Promise.all(sends);
  }

  /**
   * Trigger para el evento 'downgrade_returned' — HR/Mgmt bajó la urgency de un caso
   * escalado (H/C) a Low/Medium y lo devolvió al coordinator (status → PENDING).
   * Destinatarios: coordinator(s) asignados + HR + Management.
   * El staff NO se notifica aquí — recién se entera cuando el coordinator complete su
   * propio Justify (triggerJustifiedEmails ya le manda 'justified_staff' en ese momento),
   * para no duplicar el aviso.
   */
  private async triggerDowngradeReturnedEmails(id: string, record: ICare): Promise<void> {
    const responsibleEmails = (record.responsible ?? []).map((r: any) => r.nova_email).filter(Boolean);
    const [hrEmails, managementEmails, hrAssistantEmails] = await Promise.all([
      this.getEmailsByRole('hr'),
      this.getEmailsByRole('management'),
      this.getEmailsByAnyRole('hr-assistant'),
    ]);
    const allHrEmails = [...hrEmails, ...hrAssistantEmails];
    const sends: Promise<void>[] = [];
    if (responsibleEmails.length > 0) sends.push(this.triggerEmail(id, 'downgrade_returned_coordinator', responsibleEmails));
    if (allHrEmails.length > 0) sends.push(this.triggerEmail(id, 'downgrade_returned_hr', allHrEmails));
    // record.urgency ya quedó en Low/Medium a esta altura (downgrade recién aplicado),
    // así que este gate en la práctica siempre apaga a Management — es el resultado
    // esperado: al bajar a L/M, Management deja de recibir correos de este caso.
    if (managementEmails.length > 0 && ICareService.isHighCriticalUrgency(record)) sends.push(this.triggerEmail(id, 'downgrade_returned_management', managementEmails));
    await Promise.all(sends);
  }

  // -- Create -----------------------------------------------------------------

  /**
   * Crea un nuevo registro iCare y notifica únicamente a HR.
   * El Staff NO es notificado en este momento — eso ocurre al justificar.
   *
   * @param createICareDto - Datos del nuevo iCare
   * @returns              - Registro creado
   */
  async create(createICareDto: CreateICareDto): Promise<ICare> {
    const record = this.iCareRepository.create(createICareDto);
    record.urgency = await this.resolveUrgencyForReason(record.reason);
    record.offense_category = await this.resolveOffenseCategoryForReason(record.reason);

    // Embed is_coordinator inside the existing staff_name JSONB (no migration needed)
    let isStaffCoordinator = false;
    if (record.staff_name?.employee_number) {
      const staffEmployee = await this.employeeRepository.findOne({
        where: { employee_number: record.staff_name.employee_number },
        select: ['roles'],
      });
      const staffRoles: string[] = (staffEmployee as any)?.roles ?? [];
      isStaffCoordinator = staffRoles.some(r =>
        r === 'coordinator' || r === 'coordinator-assistant' || r === 'super-coordinator',
      );
      if (isStaffCoordinator) {
        record.staff_name = { ...record.staff_name, is_coordinator: true };
      }
    }

    // Caso "propio personal": el submitter aparece dentro de responsible[] (es supervisor/
    // coordinator asignado del staff reportado). Escala directo a HR/Management —
    // el caso queda oculto para el coordinator hasta que aprueben la creación.
    // No aplica si el staff reportado ya es coordinator (ese caso ya escala por su cuenta arriba).
    const submitterEmployeeNumber = record.submitter?.employee_number;
    const isOwnPersonnelCase =
      !isStaffCoordinator &&
      !!submitterEmployeeNumber &&
      Array.isArray(record.responsible) &&
      record.responsible.some(r => r?.employee_number === submitterEmployeeNumber);

    if (isOwnPersonnelCase) {
      record.status = ICareStatus.PENDING_CREATION_REVIEW;
      record.creation_review_required = true;
    }

    const saved = await this.iCareRepository.save(record);

    // 4 envíos separados: staff, coordinators, HR, Management
    this.triggerCreatedEmails(saved.id, saved).catch((err) =>
      this.logger.error(
        `❌ Failed to trigger created emails for id=${saved.id}`,
        err?.message || err,
      ),
    );
    // 2026-08-28: campana genérica de it_backend — mismo evento, mismo público.
    this.triggerCreatedBellNotification(saved.id, saved).catch((err) =>
      this.logger.error(
        `❌ Failed to trigger created bell notification for id=${saved.id}`,
        err?.message || err,
      ),
    );

    return saved;
  }

  // -- FindAll ----------------------------------------------------------------

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

  // -- FindOne ----------------------------------------------------------------

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
      const transformed = this.transformDates([record])[0];

      // 2026-09-20: preview INFORMATIVO (no vinculante) del numero de ofensa
      // y sancion que le tocaria a este registro SI se justifica ahora --
      // a pedido explicito del usuario, para mostrarlo en los correos de
      // creacion (created_hr/coordinator/management) ANTES de que exista un
      // offense_number committed. Una vez justificado, offense_number ya no
      // es null y este bloque no vuelve a calcular nada (se usa el valor real).
      if (record.offense_category && record.offense_number == null) {
        try {
          const preview = await this.resolveOffenseEscalation(
            record.staff_name?.employee_number,
            record.offense_category,
            record.id,
          );
          (transformed as any).potential_offense_number = preview.offenseNumber;
          (transformed as any).potential_offense_sanction_label = preview.sanctionLabel;
          (transformed as any).potential_is_permanent_offense = preview.isPermanent;
        } catch (previewError) {
          this.logger.warn(`[offense] no se pudo calcular preview para iCare id=${id}: ${previewError}`);
        }
      }

      return transformed;
    } catch (error) {
      this.logger.error(`Error fetching ICare record with ID: ${id}`, error);
      throw error;
    }
  }

  // -- Update -----------------------------------------------------------------

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

    // Merge directly into the entity instance so TypeORM tracks the change correctly.
    // Spreading into a plain object loses entity metadata and can cause JSONB columns
    // (like `attachments`) to be skipped in the UPDATE query.
    Object.assign(existingRecord, updateICareDto);

    if (updateICareDto.reason) {
      existingRecord.urgency = await this.resolveUrgencyForReason(existingRecord.reason);
      existingRecord.offense_category = await this.resolveOffenseCategoryForReason(existingRecord.reason);
    }

    existingRecord.updatedAt = new Date();

    return await this.iCareRepository.save(existingRecord);
  }

  // -- Remove -----------------------------------------------------------------

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

  // -- FindByFilters ----------------------------------------------------------

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
      urgencies?: ICareUrgency[];
      statuses?: ICareStatus[];
      committed?: boolean;
      department?: string;
      /** Urgencies to EXCLUDE from results (e.g. ['high','critical'] for coordinator view) */
      excludeUrgencies?: ICareUrgency[];
      /** Filter records where staff multi_position contains ANY of these positions */
      staffPositions?: string[];
      /** When true, combine department + staffPositions as OR (for coordinator + i-care-* combined roles) */
      orScope?: boolean;
      /** Exclude records where staff_name.employee_number equals this value (coordinators hide their own iCares) */
      excludeStaffEmployeeNumber?: string;
      /** When true, only return records with NULL urgency */
      noUrgency?: boolean;
      /** Filtra por resultado de la revisión de creación (HR/Mgmt ya decidieron sobre un
       *  caso pending_creation_review): true = aprobado, false = rechazado, undefined = sin filtro */
      creationReviewApproved?: boolean;
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

      if (filters.noUrgency && filters.urgencies && filters.urgencies.length > 0) {
        // Ambos: (urgency IN (...) OR urgency IS NULL)
        query.andWhere(new Brackets(qb => {
          qb.where('icare.urgency IN (:...filterUrgencies)', { filterUrgencies: filters.urgencies })
            .orWhere('icare.urgency IS NULL');
        }));
      } else if (filters.noUrgency) {
        query.andWhere('icare.urgency IS NULL');
      } else if (filters.urgencies && filters.urgencies.length > 0) {
        query.andWhere('icare.urgency IN (:...filterUrgencies)', { filterUrgencies: filters.urgencies });
      }

      if (filters.excludeUrgencies && filters.excludeUrgencies.length > 0) {
        query.andWhere('(icare.urgency NOT IN (:...excludeUrgencies) OR icare.urgency IS NULL)', {
          excludeUrgencies: filters.excludeUrgencies,
        });
      }

      // Scope filter: department OR staffPositions (when orScope=true), otherwise each as AND
      const hasDept = !!filters.department;
      const hasPos = filters.staffPositions && filters.staffPositions.length > 0;

      if (hasDept && hasPos && filters.orScope) {
        // Coordinator + i-care-* roles: (dept matches) OR (position matches)
        const deptStr = filters.department!;
        const positions = filters.staffPositions!;
        query.andWhere(new Brackets(qb => {
          const depts = deptStr.split(',').map(d => d.trim()).filter(Boolean);
          depts.forEach((d, i) => {
            qb.orWhere(`icare.department ILIKE :scopeDept${i}`, { [`scopeDept${i}`]: `%${d}%` });
          });
          positions.forEach((pos, i) => {
            qb.orWhere(`icare.multi_position::jsonb @> :scopePos${i}::jsonb`, {
              [`scopePos${i}`]: JSON.stringify([pos]),
            });
          });
        }));
      } else {
        if (hasPos) {
          const positions = filters.staffPositions!;
          query.andWhere(new Brackets(qb => {
            positions.forEach((pos, i) => {
              qb.orWhere(`icare.multi_position::jsonb @> :staffPos${i}::jsonb`, {
                [`staffPos${i}`]: JSON.stringify([pos]),
              });
            });
          }));
        }
        if (hasDept) {
          const depts = filters.department!.split(',').map(d => d.trim()).filter(Boolean);
          if (depts.length === 1) {
            query.andWhere('icare.department ILIKE :dept0', { dept0: `%${depts[0]}%` });
          } else {
            const conditions = depts.map((_, i) => `icare.department ILIKE :dept${i}`);
            const params: Record<string, string> = {};
            depts.forEach((d, i) => { params[`dept${i}`] = `%${d}%`; });
            query.andWhere(`(${conditions.join(' OR ')})`, params);
          }
        }
      }

      if (filters.excludeStaffEmployeeNumber) {
        query.andWhere(
          `TRIM(icare.staff_name->>'employee_number') != TRIM(:excludeStaffEmpNum)`,
          { excludeStaffEmpNum: filters.excludeStaffEmployeeNumber },
        );
      }

      // Registros en pending_creation_review: se ocultan SOLO del coordinator que los creó
      // (conflicto de interés — es juez y parte de su propio reporte). Otros supervisores
      // del mismo staff sí los ven (de solo lectura, hasta que HR/Management decida) — así
      // se enteran de que el caso existe sin poder actuar sobre él (eso queda exclusivo de
      // HR/Management vía review-creation). Reutiliza excludeStaffEmployeeNumber, que ya
      // trae el employee_number del usuario logueado, comparándolo ahora contra el submitter
      // en vez del staff reportado.
      if (filters.excludeStaffEmployeeNumber) {
        query.andWhere(new Brackets(qb => {
          qb.where('icare.status != :hideCreationReviewForCreator', {
            hideCreationReviewForCreator: ICareStatus.PENDING_CREATION_REVIEW,
          }).orWhere(`TRIM(icare.submitter->>'employee_number') != TRIM(:currentUserEmpNum)`, {
            currentUserEmpNum: filters.excludeStaffEmployeeNumber,
          });
        }));
      }

      if (filters.creationReviewApproved !== undefined) {
        query.andWhere('icare.creation_reviewed = true AND icare.creation_review_approved = :creationReviewApproved', {
          creationReviewApproved: filters.creationReviewApproved,
        });
      }

      // Cuando committed=true, los records activos tienen status in_progress/following_up.
      // Para evitar el conflicto de AND con statuses del usuario (ej. pending, pending_hr_review),
      // se ignora el filtro de status cuando committed=true — el committed boolean es suficiente.
      // Cuando committed=false o sin filtro de commitment, el status se aplica normalmente.
      if (filters.committed === true) {
        // Solo filtrar por committed, ignorar statuses
        query.andWhere('icare.committed = :committed', { committed: true });
      } else {
        if (filters.statuses && filters.statuses.length > 0) {
          query.andWhere('icare.status IN (:...filterStatuses)', { filterStatuses: filters.statuses });
        }
        if (filters.committed === false) {
          query.andWhere('icare.committed = :committed', { committed: false });
        }
      }

      query.orderBy('icare.createdAt', 'DESC').skip((page - 1) * limit).take(limit);

      this.logger.debug(`[findByFilters] SQL: ${query.getSql()}`);
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

  // -- FindByCurrentSubmitter -------------------------------------------------

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

  // -- FindByStaff ------------------------------------------------------------

  /**
   * Retorna todos los iCare asignados a un empleado de staff específico,
   * identificado por su employee_number. Ordenados por fecha de creación DESC.
   *
   * @param employeeNumber - Número de empleado del staff
   * @returns              - Lista de registros
   */
  async findByStaff(employeeNumber: string): Promise<ICare[]> {
    try {
      // BUG (encontrado 2026-09-20, probando ICarePeople.vue): el `where`
      // anidado de TypeORM de abajo NUNCA matcheaba contra la columna
      // jsonb `staff_name` -- TypeORM compara el JSON COMPLETO contra
      // `{"employee_number": "..."}` en vez de hacer un path query, y el
      // objeto real tiene mas keys (name, last_name, nova_email, ...), asi
      // que esto devolvia [] siempre. Nadie lo habia notado porque ningun
      // frontend llamaba a este metodo hasta ahora. Mismo patron que ya usa
      // findByCurrentSubmitter() (arriba) para `submitter`, que si funciona:
      //
      //   const records = await this.iCareRepository.find({
      //     where: { staff_name: { employee_number: employeeNumber } },
      //     order: { createdAt: 'DESC' },
      //   });
      // 2026-09-20: a pedido explicito del usuario, la vista de iCare People
      // (esta lista Y los conteos de getStaffSummary) NO debe considerar
      // registros 'pending' ni 'rejected' -- mismo criterio en ambos lados,
      // sino los conteos ("1 total") no cuadran con lo que se ve en la lista.
      const records = await this.iCareRepository
        .createQueryBuilder('icare')
        .where(`TRIM(icare.staff_name->>'employee_number') = TRIM(:employeeNumber)`, {
          employeeNumber: employeeNumber.trim(),
        })
        .andWhere('icare.status NOT IN (:...excludedStatuses)', {
          excludedStatuses: [ICareStatus.PENDING, ICareStatus.REJECTED],
        })
        .orderBy('icare.createdAt', 'DESC')
        .getMany();
      return this.transformDates(records);
    } catch (error) {
      this.logger.error('Error fetching ICare records by staff:', error);
      throw error;
    }
  }

  // -- GetStaffSummary ---------------------------------------------------------

  /**
   * Listado paginado de personas (staff) con al menos un iCare en su contra:
   * nombre, departamento, total acumulado de iCares y fecha del mas reciente.
   * Alimenta la vista "iCare People" (historial por persona), agrupando por
   * staff_name->>'employee_number' -- mismo criterio jsonb que ya usa
   * topReportedStaff() dentro de analytics(), pero sin el LIMIT 10 y con
   * paginacion/busqueda propias para poder listar a todo el mundo.
   *
   * @param filters - search (nombre o employee_number), department, sortBy
   *                  ('total_count' | 'name' | 'last_icare_date'), sortDir
   *                  ('asc' | 'desc'), page, limit
   */
  async getStaffSummary(filters: {
    page: number;
    limit: number;
    search?: string;
    department?: string;
    sortBy?: string;
    sortDir?: string;
  }): Promise<{ data: any[]; total: number; page: number; limit: number; pageCount: number }> {
    const page = Math.max(1, filters.page || 1);
    const limit = Math.min(100, Math.max(1, filters.limit || 15));
    const offset = (page - 1) * limit;

    const SORT_COLUMNS: Record<string, string> = {
      total_count: 'total_count',
      name: 'name',
      last_icare_date: 'last_icare_date',
    };
    const sortColumn = SORT_COLUMNS[filters.sortBy ?? 'total_count'] ?? 'total_count';
    const sortDir = (filters.sortDir ?? 'desc').toLowerCase() === 'asc' ? 'ASC' : 'DESC';
    const tieBreaker = sortColumn === 'name' ? '' : ', name ASC';

    const params: any[] = [];
    const conds: string[] = [
      `i.staff_name IS NOT NULL`,
      `NULLIF(TRIM(i.staff_name->>'employee_number'), '') IS NOT NULL`,
      // 2026-09-20: a pedido explicito del usuario, la vista de iCare People
      // (conteos total/permanent/active + de quien aparece en la lista) NO
      // debe considerar registros todavia 'pending' -- aun no fueron
      // justificados/rechazados, no son un historial disciplinario real --
      // NI registros 'rejected' -- a pedido explicito del usuario, un
      // rechazo tampoco cuenta como ofensa/historial disciplinario.
      `i.status != '${ICareStatus.PENDING}'`,
      `i.status != '${ICareStatus.REJECTED}'`,
    ];

    if (filters.search?.trim()) {
      params.push(`%${filters.search.trim()}%`);
      conds.push(`(
        i.staff_name->>'employee_number' ILIKE $${params.length}
        OR TRIM(CONCAT(i.staff_name->>'name', ' ', i.staff_name->>'last_name')) ILIKE $${params.length}
      )`);
    }
    if (filters.department?.trim()) {
      params.push(`%${filters.department.trim()}%`);
      conds.push(`i.department ILIKE $${params.length}`);
    }

    const WHERE = conds.join(' AND ');

    try {
      const [totalRow] = await this.iCareRepository.query(
        `SELECT COUNT(DISTINCT i.staff_name->>'employee_number')::int AS total
           FROM i_care i WHERE ${WHERE}`,
        params,
      );
      const total = Number(totalRow?.total ?? 0);

      // 2026-09-20: "numero de ofensas" vigentes por persona -- a pedido
      // explicito del usuario, mismo criterio EXACTO que resolveOffenseEscalation():
      // permanentes (nunca expiran) + no-permanentes que todavia no cumplen 12
      // meses desde justified_date. Confirmado con ejemplo concreto: 1 permanente
      // viejo (sigue) + 2 ofensas nuevas (ambas vigentes, una de ellas permanente) = 3.
      const oneYearAgo = moment().tz('America/Chicago').subtract(1, 'year').format('YYYY-MM-DD');
      const oneYearAgoIdx = params.length + 1;
      const limitIdx = params.length + 2;
      const offsetIdx = params.length + 3;
      const data = await this.iCareRepository.query(
        `SELECT
             i.staff_name->>'employee_number' AS employee_number,
             MAX(TRIM(i.staff_name->>'name')) AS name,
             MAX(TRIM(i.staff_name->>'last_name')) AS last_name,
             MAX(i.staff_name->>'nova_email') AS nova_email,
             MAX(NULLIF(i.department, '')) AS department,
             COUNT(*)::int AS total_count,
             COUNT(*) FILTER (WHERE i.is_permanent_offense = true)::int AS permanent_count,
             COUNT(*) FILTER (
               WHERE i.offense_number IS NOT NULL
                 AND (i.is_permanent_offense = true OR i.justified_date >= $${oneYearAgoIdx})
             )::int AS active_offense_count,
             MAX(i.date) AS last_icare_date
           FROM i_care i
           WHERE ${WHERE}
           GROUP BY 1
           ORDER BY ${sortColumn} ${sortDir} NULLS LAST${tieBreaker}
           LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
        [...params, oneYearAgo, limit, offset],
      );

      return {
        data,
        total,
        page,
        limit,
        pageCount: Math.max(1, Math.ceil(total / limit)),
      };
    } catch (error) {
      this.logger.error('Error fetching ICare staff summary:', error);
      throw error;
    }
  }

  // -- GetStats ---------------------------------------------------------------

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
    urgencies?: ICareUrgency[];
    statuses?: ICareStatus[];
    department?: string;
    excludeUrgencies?: ICareUrgency[];
    staffPositions?: string[];
    orScope?: boolean;
    excludeStaffEmployeeNumber?: string;
    noUrgency?: boolean;
  } = {}): Promise<any> {
    try {
      this.logger.log(`Fetching ICare statistics with filters: ${JSON.stringify(filters)}`);

      // -- Helper: aplica filtro de departamento a cualquier QueryBuilder --------
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

      // -- Helper: aplica filtros base comunes a cualquier QueryBuilder ----------
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
        if (filters.noUrgency) {
          qb.andWhere('icare.urgency IS NULL');
        } else if (filters.urgencies?.length) {
          qb.andWhere('icare.urgency IN (:...filterUrgencies)', { filterUrgencies: filters.urgencies });
        }
        if (filters.statuses?.length) {
          qb.andWhere('icare.status IN (:...filterStatuses)', { filterStatuses: filters.statuses });
        }
        if (filters.excludeUrgencies?.length) {
          qb.andWhere('(icare.urgency NOT IN (:...excludeUrgenciesStats) OR icare.urgency IS NULL)', {
            excludeUrgenciesStats: filters.excludeUrgencies,
          });
        }
        if (filters.excludeStaffEmployeeNumber) {
          qb.andWhere(
            `TRIM(icare.staff_name->>'employee_number') != TRIM(:excludeStaffEmpNumStats)`,
            { excludeStaffEmpNumStats: filters.excludeStaffEmployeeNumber },
          );
        }
        const hasScopePos = (filters.staffPositions?.length ?? 0) > 0;
        const hasScopeDept = !!filters.department;

        if (hasScopePos && hasScopeDept && filters.orScope) {
          // Coordinator + i-care-* roles: (dept matches) OR (position matches)
          const deptStr = filters.department!;
          const positions = filters.staffPositions!;
          qb.andWhere(new Brackets(inner => {
            const depts = deptStr.split(',').map(d => d.trim()).filter(Boolean);
            depts.forEach((d, i) => {
              inner.orWhere(`icare.department ILIKE :statsScopeDept${i}`, { [`statsScopeDept${i}`]: `%${d}%` });
            });
            positions.forEach((pos, i) => {
              inner.orWhere(`icare.multi_position::jsonb @> :statsScopePos${i}::jsonb`, {
                [`statsScopePos${i}`]: JSON.stringify([pos]),
              });
            });
          }));
        } else {
          if (hasScopePos) {
            const positions = filters.staffPositions!;
            qb.andWhere(new Brackets(inner => {
              positions.forEach((pos, i) => {
                inner.orWhere(`icare.multi_position::jsonb @> :statsPos${i}::jsonb`, {
                  [`statsPos${i}`]: JSON.stringify([pos]),
                });
              });
            }));
          }
          applyDeptFilter(qb);
        }
        return qb;
      };

      // -- totalRecords ----------------------------------------------------------
      const baseQuery = this.iCareRepository.createQueryBuilder('icare');
      applyBaseFilters(baseQuery);
      this.logger.debug(`[getStats] SQL: ${baseQuery.getSql()}`);
      const totalRecords = await baseQuery.getCount();

      // -- urgencyDistribution ---------------------------------------------------
      const urgencyQb = this.iCareRepository
        .createQueryBuilder('icare')
        .select('icare.urgency', 'urgency')
        .addSelect('COUNT(*)', 'count')
        .groupBy('icare.urgency');
      applyBaseFilters(urgencyQb);
      const urgencyDistribution = await urgencyQb.getRawMany();

      const urgencyMap = Object.fromEntries(
        urgencyDistribution.map(r => [r.urgency ?? '__null__', parseInt(r.count, 10)]),
      );
      const lowCount = urgencyMap[ICareUrgency.LOW] || 0;
      const mediumCount = urgencyMap[ICareUrgency.MEDIUM] || 0;
      const highCount = urgencyMap[ICareUrgency.HIGH] || 0;
      const criticalCount = urgencyMap[ICareUrgency.CRITICAL] || 0;
      const noUrgencyCount = urgencyMap['__null__'] || 0;

      // -- statusDistribution ----------------------------------------------------
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
      const rejectedStatusCount = statusMap[ICareStatus.REJECTED] || 0;
      const solvedStatusCount = statusMap[ICareStatus.SOLVED] || 0;
      const followingUpStatusCount = statusMap[ICareStatus.FOLLOWING_UP] || 0;
      const commitFulfilledStatusCount = statusMap[ICareStatus.COMMIT_FULFILLED] || 0;
      const pendingHrReviewStatusCount = statusMap[ICareStatus.PENDING_HR_REVIEW] || 0;
      const rejectionUnderReviewStatusCount = statusMap[ICareStatus.REJECTION_UNDER_REVIEW] || 0;
      const pendingCreationReviewStatusCount = statusMap[ICareStatus.PENDING_CREATION_REVIEW] || 0;
      const pendingHrJustifyStatusCount = statusMap[ICareStatus.PENDING_HR_JUSTIFY] || 0;

      // -- monthlyTrend (últimos 6 meses) ----------------------------------------
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

      // -- committedCount / pendingCount -----------------------------------------
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

      // -- criticalActiveCount: High o Critical, excluyendo SOLVED y REJECTED ----
      const criticalActiveQb = this.iCareRepository
        .createQueryBuilder('icare')
        .where('icare.urgency IN (:...criticalUrgencies)', {
          criticalUrgencies: [ICareUrgency.HIGH, ICareUrgency.CRITICAL],
        });
      if (filters.statuses?.length) {
        criticalActiveQb.andWhere('icare.status IN (:...criticalStatuses)', { criticalStatuses: filters.statuses });
      } else {
        criticalActiveQb.andWhere(
          'icare.status NOT IN (:...excluded)',
          { excluded: [ICareStatus.SOLVED, ICareStatus.REJECTED] },
        );
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
        noUrgencyCount,
        criticalActiveCount,
        urgencyDistribution,
        // por status
        pendingStatusCount,
        inProgressStatusCount,
        rejectedStatusCount,
        solvedStatusCount,
        followingUpStatusCount,
        commitFulfilledStatusCount,
        pendingHrReviewStatusCount,
        rejectionUnderReviewStatusCount,
        pendingCreationReviewStatusCount,
        pendingHrJustifyStatusCount,
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

  // -- Justify ----------------------------------------------------------------

  /**
   * HR marca un iCare como justificado (o no justificado).
   * Si justified=true:
   *   - Avanza el status a IN_PROGRESS
   *   - Registra quién aprobó, fecha y hora (America/Chicago)
   *   - Agrega el comment al array justified_comments (si viene)
   *   - Dispara email a: staff_name + coordinator(s) + role 'management'
   * Si justified=false: status → REJECTION_UNDER_REVIEW para que HR/Management hagan el review.
   *
   * @param id  - UUID del iCare
   * @param dto - { justified, approved_by, comment? }
   * @returns   - Registro actualizado
   */
  async justify(id: string, dto: JustifyICareDto): Promise<ICare> {
    const record = await this.iCareRepository.findOne({ where: { id } });
    if (!record) throw new NotFoundException(`ICare record with id ${id} not found`);

    if (record.status === ICareStatus.PENDING_CREATION_REVIEW) {
      throw new ForbiddenException('This record still needs HR/Management to approve its creation before it can be justified');
    }

    // justify() aplica a records en 'pending' (flujo normal / post-downgrade / post-override,
    // siempre actuado por el coordinator desde 2026-08-28) o 'pending_hr_justify' (solo
    // backlog: casos H/C-override de antes del 2026-08-28, esos si los justifica HR/Mgmt).
    if (record.status !== ICareStatus.PENDING && record.status !== ICareStatus.PENDING_HR_JUSTIFY) {
      throw new BadRequestException('Record is not in a justifiable state');
    }

    // Downgrade (approveJustification 'downgrade', backlog legacy): HR/Mgmt SI fija la urgency a
    // mano. Override (reviewRejection, 2026-08-28+): la urgency ya no se toca aca (la fija la
    // reason al crear) y el caso siempre vuelve al coordinator. En ambos, quien justifique ya no
    // puede rechazarlo ni cambiar la urgency, solo justificarlo/aceptarlo tal cual quedó.
    if (record.downgraded || record.rejection_override) {
      if (dto.justified === false) {
        throw new ForbiddenException('This case was already reviewed by HR/Management — it cannot be rejected, only justified');
      }
    }

    // 2026-08-28: la urgency ya no se elige en ningun paso del flujo -- se deriva
    // de la reason al crear/editar el iCare (ver resolveUrgencyForReason) y queda
    // fija. Ni coordinator, ni HR/Management, ni employee pueden cambiarla desde
    // aqui. Si el cliente manda un dto.urgency que no coincide con record.urgency
    // (payload viejo o manipulado), se rechaza la request en vez de ignorarlo.
    if (dto.urgency && dto.urgency !== record.urgency) {
      throw new ForbiddenException('Urgency is set automatically from the reason and cannot be changed');
    }

    const now = moment().tz('America/Chicago');

    record.justified = dto.justified;
    record.justified_approved_by = dto.approved_by;
    record.justified_date = now.format('YYYY-MM-DD');
    record.justified_time = now.format('HH:mm');

    // 2026-08-28: urgency ya no se guarda desde dto.urgency -- quedo fija desde
    // que se creo/edito el record (derivada de la reason). Ver validacion arriba
    // y resolveUrgencyForReason().

    if (dto.comment) {
      record.justified_comments = [
        ...(record.justified_comments ?? []),
        dto.comment,
      ];
    }

    if (dto.attachments?.length) {
      record.justified_attachments = [
        ...(record.justified_attachments ?? []),
        ...dto.attachments,
      ];
    }

    // 2026-08-27: se suma 'super-coordinator' -- tambien gestiona H/C ahora,
    // debe contar para el snapshot de auditoria y el aviso informativo a HR/Mgmt.
    const isCoordinatorRole = dto.caller_role === 'coordinator' || dto.caller_role === 'coordinator-assistant' || dto.caller_role === 'super-coordinator';
    // Se evalúa sobre record.urgency (valor ya persistido en memoria arriba) y no sobre
    // dto.urgency crudo, para que un caso downgraded (que no manda urgency en el payload
    // una vez corregido el frontend) siga evaluando correctamente su urgency real.
    const isHighCriticalUrgency = record.urgency === ICareUrgency.HIGH || record.urgency === ICareUrgency.CRITICAL;

    if (dto.justified) {
      // 2026-08-27: High/Critical ya no escala a pending_hr_review -- el
      // coordinator (o super-coordinator) gestiona el caso completo, status
      // siempre in_progress. Se conserva el snapshot escalated_* (para
      // Analytics/auditoria) cuando aplica H/C-por-coordinator, pero ya no
      // bloquea nada ni cambia el status.
      record.status = ICareStatus.IN_PROGRESS;
      if (isCoordinatorRole && isHighCriticalUrgency && !record.escalated) {
        record.escalated = true;
        record.escalated_by = dto.approved_by;
        record.escalated_date = now.format('YYYY-MM-DD');
        record.escalated_time = now.format('HH:mm');
        record.escalated_urgency = record.urgency;
        record.escalated_comment = dto.comment ?? null;
        record.escalated_attachments = dto.attachments?.length ? [...dto.attachments] : [];
      }

      // 2026-09-20: escalada de sanciones por offense_category -- ver JSDoc de
      // resolveOffenseEscalation(). Solo aplica si el reason tiene categoria
      // asignada (offense_category es opcional en el catalogo).
      if (record.offense_category) {
        const escalation = await this.resolveOffenseEscalation(
          record.staff_name?.employee_number,
          record.offense_category,
          record.id,
        );
        record.offense_number = escalation.offenseNumber;
        record.is_permanent_offense = escalation.isPermanent;
        record.offense_sanction_label = escalation.sanctionLabel;
      }
    } else {
      record.status = ICareStatus.REJECTION_UNDER_REVIEW;
    }

    const saved = await this.iCareRepository.save(record);

    if (dto.justified) {
      if (isCoordinatorRole && isHighCriticalUrgency) {
        // 2026-08-27: ya no es un "review pendiente" que bloquea -- es un aviso
        // informativo a HR/Mgmt de que el coordinator gestiono un H/C directamente.
        this.triggerHcHandledByCoordinatorEmails(saved.id, saved).catch((err) =>
          this.logger.error(`❌ Failed to trigger 'hc_handled_by_coordinator' emails for id=${saved.id}`, err?.message || err),
        );
      } else if (!dto.skip_notification) {
        // skip_notification=true (Coaching Session bundle): commit() +
        // approveCommit()/fulfillCommit() fire right after in the same
        // submit and the last of those is the one that actually notifies
        // people — see JustifyICareDto.skip_notification.
        this.triggerJustifiedEmails(saved.id, saved).catch((err) =>
          this.logger.error(`❌ Failed to trigger 'justified' emails for id=${saved.id}`, err?.message || err),
        );
      }

      // 2026-09-20: si esta ofensa cruzo el umbral de permanente, crear sola
      // la entrada en el logbook (seccion 'sanctions') -- ver JSDoc de
      // createPermanentOffenseLogbookEntry().
      if (saved.is_permanent_offense) {
        this.createPermanentOffenseLogbookEntry(saved).catch((err) =>
          this.logger.error(`❌ Failed to create permanent offense logbook entry for id=${saved.id}`, err?.message || err),
        );
      }
    } else {
      this.triggerCoordinatorRejectedEmails(saved.id, saved).catch((err) =>
        this.logger.error(`❌ Failed to trigger 'not_justified' emails for id=${saved.id}`, err?.message || err),
      );
      // 2026-08-31: mismo evento de negocio que coordinatorReject() -- ver JSDoc de
      // triggerCoordinatorRejectedBellNotification. Este es el 2do punto de entrada
      // (toggle "Reject" del dialog de Justify) y NUNCA tenia push a campana.
      // record.coordinator_rejected_by no se setea en esta rama, por eso se pasa
      // dto.approved_by como actor.
      this.triggerCoordinatorRejectedBellNotification(saved.id, saved, dto.approved_by).catch((err) =>
        this.logger.error(`❌ Failed to trigger 'coordinator_rejected' bell notification for id=${saved.id}`, err?.message || err),
      );
    }

    return this.transformDates([saved])[0];
  }

  // -- Commit -----------------------------------------------------------------

  /**
   * HR/Management aprueban, bajan nivel o rechazan una justificación H/C en PENDING_HR_REVIEW.
   */
  async approveJustification(id: string, dto: ApproveJustificationICareDto): Promise<ICare> {
    const record = await this.iCareRepository.findOne({ where: { id } });
    if (!record) throw new NotFoundException(`ICare record with id ${id} not found`);

    if (record.status !== ICareStatus.PENDING_HR_REVIEW) {
      throw new BadRequestException('Record is not pending HR/Management review');
    }

    const now = moment().tz('America/Chicago');

    if (dto.action === 'accept') {
      if (!dto.urgency) throw new BadRequestException('Urgency is required when accepting');
      if (dto.urgency !== ICareUrgency.HIGH && dto.urgency !== ICareUrgency.CRITICAL) {
        throw new BadRequestException('Accept requires High or Critical urgency — use action "downgrade" for Low/Medium');
      }
      record.urgency = dto.urgency;
      record.status = ICareStatus.IN_PROGRESS;
      record.justified = true;
      record.justified_approved_by = dto.reviewed_by;
      record.justified_date = now.format('YYYY-MM-DD');
      record.justified_time = now.format('HH:mm');
      if (dto.notes) record.hr_justified_notes = dto.notes;
      if (dto.attachments?.length) record.hr_justified_attachments = [...(record.hr_justified_attachments ?? []), ...dto.attachments];
      const saved = await this.iCareRepository.save(record);
      this.triggerHcAcceptedEmails(saved.id, saved).catch((err) =>
        this.logger.error(`❌ Failed to trigger 'hc_accepted' emails for id=${saved.id}`, err?.message || err),
      );
      return this.transformDates([saved])[0];
    }

    // HR/Mgmt determina que el caso escalado NO amerita High/Critical — lo baja a Low/Medium
    // y lo regresa al coordinator (status → PENDING) para que complete su propio Justify,
    // igual que cualquier caso L/M nuevo. No se toca `justified` aquí: lo setea el coordinator
    // en su siguiente llamada a justify().
    //
    // Stage propio con columnas dedicadas (downgraded_*) — NO reutiliza justified_approved_by /
    // hr_justified_notes / hr_justified_attachments, que pertenecen al stage "Coordinator
    // Justification"/"HR Accept". Reutilizarlos pisaba el autor original de la justificación
    // del coordinator en el Case History hasta el siguiente justify(). Ver migration_downgrade_returned.sql.
    if (dto.action === 'downgrade') {
      if (!dto.urgency) throw new BadRequestException('Urgency is required when downgrading');
      if (dto.urgency !== ICareUrgency.LOW && dto.urgency !== ICareUrgency.MEDIUM) {
        throw new BadRequestException('Downgrade requires Low or Medium urgency — use action "accept" to keep High/Critical');
      }
      record.downgraded = true;
      record.downgraded_by = dto.reviewed_by;
      record.downgraded_date = now.format('YYYY-MM-DD');
      record.downgraded_time = now.format('HH:mm');
      record.downgraded_from_urgency = record.urgency; // captura el H/C original antes de pisarlo
      // Limpiar el snapshot de justify() de la escalación original: justified/justified_date/time
      // ya no representan nada válido — pertenecían al justify() que mandó el caso a HR, y ese
      // evento ya quedó inmortalizado aparte en escalated_*. Si no se limpian: (1) el Case History
      // muestra un stage "Coordinator Justification" fantasma (con la fecha/comentario de la
      // escalación) ANTES de que el coordinator realmente vuelva a justificar tras el downgrade,
      // y (2) la tabla/timeline lo siguen marcando como "Justified" pese a estar de vuelta en Pending.
      record.justified = false;
      record.justified_date = null;
      record.justified_time = null;
      // Mismo motivo: justified_comments/justified_attachments son append-only en justify()
      // (para permitir agregar evidencia dentro de un mismo episodio). Si no se vacían aquí,
      // el re-justify post-downgrade ACUMULA la evidencia/comentario de la escalación original
      // encima de la nueva — dos stages independientes terminan mostrando los mismos archivos.
      // La evidencia/comentario original de la escalación ya vive, intacta, en escalated_*.
      record.justified_comments = [];
      record.justified_attachments = [];
      if (dto.notes) record.downgraded_notes = dto.notes;
      if (dto.attachments?.length) record.downgraded_attachments = [...(record.downgraded_attachments ?? []), ...dto.attachments];
      record.urgency = dto.urgency;
      record.status = ICareStatus.PENDING;
      const saved = await this.iCareRepository.save(record);
      this.triggerDowngradeReturnedEmails(saved.id, saved).catch((err) =>
        this.logger.error(`❌ Failed to trigger 'downgrade_returned' emails for id=${saved.id}`, err?.message || err),
      );
      return this.transformDates([saved])[0];
    }

    if (dto.action === 'reject') {
      record.status = ICareStatus.REJECTED;
      record.coordinator_rejected = true;
      record.coordinator_rejected_by = dto.reviewed_by;
      record.coordinator_rejected_date = now.format('YYYY-MM-DD');
      record.coordinator_rejected_time = now.format('HH:mm');
      if (dto.notes) record.coordinator_rejected_notes = dto.notes;
      const saved = await this.iCareRepository.save(record);
      this.triggerHrRejectedEmails(saved.id, saved).catch((err) =>
        this.logger.error(`❌ Failed to trigger 'hr_rejected' emails for id=${saved.id}`, err?.message || err),
      );
      return this.transformDates([saved])[0];
    }

    throw new BadRequestException('Invalid action');
  }

  /**
   * El Staff registra su compromiso (commit) sobre el iCare.
   * Si committed=true:
   *   - Guarda fecha, hora (America/Chicago si no se proveen) y notas del commit
   *   - Dispara email a: role 'hr' + coordinator(s) + role 'management'
   * Si committed=false: limpia todos los campos de commit sin enviar emails.
   *
   * @param id  - UUID del iCare
   * @param dto - { committed, committed_date?, committed_time?, committed_notes? }
   * @returns   - Registro actualizado
   */
  async commit(id: string, dto: CommitICareDto): Promise<ICare> {
    const record = await this.iCareRepository.findOne({ where: { id } });
    if (!record) throw new NotFoundException(`ICare record with id ${id} not found`);

    // 2026-08-19 workflow change ("Coaching Session"): formalizes as a backend
    // guard what was previously only enforced by the frontend UI (MyICare.vue
    // only showed the commit action once status was 'in_progress' and
    // record.justified was true) — the coordinator's part (Justify) must
    // happen before a commit can be recorded, whoever ends up submitting it.
    // Only checked when actually setting committed=true; un-committing
    // (dto.committed === false) is left unguarded as before.
    if (dto.committed && (record.status !== ICareStatus.IN_PROGRESS || !record.justified)) {
      throw new BadRequestException(
        'Record must be justified and In Progress before a commitment can be recorded',
      );
    }

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

    // Notificar a HR + Coordinator + Management cuando el Staff hace commit.
    // skip_notification=true (Coaching Session bundle): approveCommit()/
    // fulfillCommit() fire right after in the same submit and are the ones
    // that actually notify people — see CommitICareDto.skip_notification.
    if (dto.committed && !dto.skip_notification) {
      this.triggerCommittedEmails(saved.id, saved).catch((err) =>
        this.logger.error(
          `❌ Failed to trigger 'committed' emails for id=${saved.id}`,
          err?.message || err,
        ),
      );
    }

    return this.transformDates([saved])[0];
  }

  // -- Resolve ----------------------------------------------------------------

  /**
   * HR marca el iCare como resuelto (SOLVED).
   * Registra quién lo resolvió, fecha, hora (America/Chicago) y notas opcionales.
   * Siempre dispara email a: staff_name + coordinator(s) + role 'management'.
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

    if (dto.attachments?.length) {
      record.resolved_attachments = [
        ...(record.resolved_attachments ?? []),
        ...dto.attachments,
      ];
    }

    const saved = await this.iCareRepository.save(record);

    // Notificar a Staff + Coordinator + Management al resolver
    this.triggerResolvedEmails(saved.id, saved).catch((err) =>
      this.logger.error(
        `❌ Failed to trigger 'resolved' email for id=${saved.id}`,
        err?.message || err,
      ),
    );
    this.triggerResolvedBellNotification(saved.id, saved).catch((err) =>
      this.logger.error(
        `❌ Failed to trigger 'resolved' bell notification for id=${saved.id}`,
        err?.message || err,
      ),
    );

    return this.transformDates([saved])[0];
  }

  // -- ApproveCommit ----------------------------------------------------------

  /**
   * Coordinator o HR aprueba el commit del staff y asigna el primer seguimiento.
   * Coordinator solo puede actuar en Low y Medium urgency.
   * HR y Management pueden actuar en cualquier urgencia.
   * Cambia status a FOLLOWING_UP y notifica a: staff + coordinator(s) + management.
   *
   * @param id  - UUID del iCare
   * @param dto - { approved_by, scheduled_date, notes? }
   * @returns   - Registro actualizado
   */
  async approveCommit(id: string, dto: ApproveCommitICareDto): Promise<ICare> {
    const record = await this.iCareRepository.findOne({ where: { id } });
    if (!record) throw new NotFoundException(`ICare record with id ${id} not found`);

    if (
      // 2026-08-27: ya no bloquea por urgencia H/C -- el coordinator gestiona
      // el caso completo. Se conserva solo el guard de peer-coordinator (auto-reporte).
      (record.staff_name?.is_coordinator === true) &&
      (dto.caller_role === 'coordinator' || dto.caller_role === 'coordinator-assistant')
    ) {
      throw new ForbiddenException('This record is handled exclusively by HR and Management');
    }

    const now = moment().tz('America/Chicago');

    record.commit_approved = true;
    record.commit_approved_by = dto.approved_by;
    record.commit_approved_date = now.format('YYYY-MM-DD');
    record.commit_approved_time = now.format('HH:mm');
    record.commit_approved_notes = dto.notes ?? null;
    record.commit_approved_attachments = dto.attachments ?? [];
    record.status = ICareStatus.FOLLOWING_UP;

    // 2026-08-22: ya NO se crea una entrada en `seguimientos[]` aquí. Elegir
    // una fecha para el primer seguimiento es una decisión de PLANEACIÓN que
    // pertenece al stage "Commit Approval" (Coaching Session o
    // approveCommitDialog) — no es en sí un seguimiento realizado. El
    // seguimiento real se crea después, cuando de verdad ocurre
    // (addSeguimiento()). Antes esto se guardaba como un `seguimientos[0]`
    // con actual_date:null, y el front lo mostraba como "Follow-up #1 ·
    // Pending" ya desde este punto, lo cual era incorrecto.
    if (!dto.is_fulfill_direct) {
      record.next_followup_scheduled_date = dto.scheduled_date;
    } else {
      record.next_followup_scheduled_date = null;
    }

    const saved = await this.iCareRepository.save(record);

    // En la ruta "con seguimiento", este paso dispara el email. En "fulfill
    // directo" (is_fulfill_direct=true) el email lo dispara fulfillCommit.
    // 2026-08-23: si coaching_session_bundle=true, este es el cierre del
    // bundle de Coaching Session — dispara 'coaching_session_completed_*'
    // en vez de 'seguimiento_added_*' (ver ApproveCommitICareDto).
    if (!dto.is_fulfill_direct) {
      if (dto.coaching_session_bundle) {
        this.triggerCoachingSessionCompletedEmails(saved.id, saved).catch((err) =>
          this.logger.error(
            `❌ Failed to trigger 'coaching_session_completed' email for id=${saved.id}`,
            err?.message || err,
          ),
        );
        this.triggerCoachingSessionBellNotification(saved.id, saved).catch((err) =>
          this.logger.error(
            `❌ Failed to trigger 'coaching_session_completed' bell notification for id=${saved.id}`,
            err?.message || err,
          ),
        );
      } else {
        this.triggerSeguimientoAddedEmails(saved.id, saved).catch((err) =>
          this.logger.error(
            `❌ Failed to trigger 'seguimiento_added' email for id=${saved.id}`,
            err?.message || err,
          ),
        );
        this.triggerSeguimientoAddedBellNotification(saved.id, saved, dto.approved_by).catch((err) =>
          this.logger.error(
            `❌ Failed to trigger 'seguimiento_added' bell notification for id=${saved.id}`,
            err?.message || err,
          ),
        );
      }
    }

    return this.transformDates([saved])[0];
  }

  // -- AddSeguimiento ---------------------------------------------------------

  /**
   * Agrega un seguimiento adicional al array de seguimientos.
   * Opcionalmente registra la fecha real del seguimiento anterior (actual_date).
   * El status permanece en FOLLOWING_UP.
   *
   * @param id  - UUID del iCare
   * @param dto - { added_by, scheduled_date, actual_date?, notes? }
   * @returns   - Registro actualizado
   */
  async addSeguimiento(id: string, dto: AddSeguimientoICareDto): Promise<ICare> {
    const record = await this.iCareRepository.findOne({ where: { id } });
    if (!record) throw new NotFoundException(`ICare record with id ${id} not found`);

    if (
      // 2026-08-27: ya no bloquea por urgencia H/C -- el coordinator gestiona
      // el caso completo. Se conserva solo el guard de peer-coordinator (auto-reporte).
      (record.staff_name?.is_coordinator === true) &&
      (dto.caller_role === 'coordinator' || dto.caller_role === 'coordinator-assistant')
    ) {
      throw new ForbiddenException('This record is handled exclusively by HR and Management');
    }

    const now = moment().tz('America/Chicago');

    const newSeguimiento = {
      id: `seg_${Date.now()}`,
      scheduled_date: dto.scheduled_date,
      actual_date: dto.actual_date ?? null,
      notes: dto.notes ?? null,
      added_by: dto.added_by,
      created_at: now.format('YYYY-MM-DD HH:mm'),
      attachments: dto.attachments ?? [],
    };

    record.seguimientos = [...(record.seguimientos ?? []), newSeguimiento];

    // 2026-08-22: este seguimiento SÍ acaba de realizarse de verdad, así que
    // limpiamos la fecha meramente "programada" que venía de Commit Approval
    // (o del seguimiento anterior) — de aquí en adelante la fuente de verdad
    // para "cuándo es el próximo" es `scheduled_date` de esta misma entrada.
    record.next_followup_scheduled_date = null;

    const saved = await this.iCareRepository.save(record);

    this.triggerSeguimientoAddedEmails(saved.id, saved).catch((err) =>
      this.logger.error(
        `❌ Failed to trigger 'seguimiento_added' email for id=${saved.id}`,
        err?.message || err,
      ),
    );
    this.triggerSeguimientoAddedBellNotification(saved.id, saved, dto.added_by).catch((err) =>
      this.logger.error(
        `❌ Failed to trigger 'seguimiento_added' bell notification for id=${saved.id}`,
        err?.message || err,
      ),
    );

    return this.transformDates([saved])[0];
  }

  // -- FulfillCommit ----------------------------------------------------------

  /**
   * Coordinator o HR marca que todos los seguimientos se han completado.
   * Cambia status a COMMIT_FULFILLED.
   * Notifica a HR + coordinator(s) + management para que HR proceda a resolver.
   *
   * @param id  - UUID del iCare
   * @param dto - { fulfilled_by, actual_date?, notes? }
   * @returns   - Registro actualizado
   */
  async fulfillCommit(id: string, dto: FulfillCommitICareDto): Promise<ICare> {
    const record = await this.iCareRepository.findOne({ where: { id } });
    if (!record) throw new NotFoundException(`ICare record with id ${id} not found`);

    if (
      // 2026-08-27: ya no bloquea por urgencia H/C -- el coordinator gestiona
      // el caso completo. Se conserva solo el guard de peer-coordinator (auto-reporte).
      (record.staff_name?.is_coordinator === true) &&
      (dto.caller_role === 'coordinator' || dto.caller_role === 'coordinator-assistant')
    ) {
      throw new ForbiddenException('This record is handled exclusively by HR and Management');
    }

    const now = moment().tz('America/Chicago');

    record.commit_fulfilled = true;
    record.commit_fulfilled_by = dto.fulfilled_by;
    record.commit_fulfilled_date = now.format('YYYY-MM-DD');
    record.commit_fulfilled_time = now.format('HH:mm');
    record.commit_fulfilled_notes = dto.notes ?? null;
    record.commit_fulfilled_attachments = dto.attachments ?? [];
    record.status = ICareStatus.COMMIT_FULFILLED;
    // 2026-08-22: ya no se espera ningún seguimiento futuro una vez fulfilled.
    record.next_followup_scheduled_date = null;

    // Si se provee actual_date para el último seguimiento, actualizarlo
    if (dto.actual_date && record.seguimientos?.length) {
      const updated = [...record.seguimientos];
      updated[updated.length - 1] = { ...updated[updated.length - 1], actual_date: dto.actual_date };
      record.seguimientos = updated;
    }

    const saved = await this.iCareRepository.save(record);

    // 2026-08-23: si coaching_session_bundle=true, este es el cierre del
    // bundle de Coaching Session (ruta "fulfill directo") — dispara
    // 'coaching_session_completed_*' en vez de 'commit_fulfilled_*' (ver
    // FulfillCommitICareDto). Una llamada standalone posterior real (p.ej.
    // "Mark Fulfilled" en seguimientoDialog tras uno o más follow-ups) NO
    // manda el flag y sigue disparando 'commit_fulfilled_*' como siempre.
    if (dto.coaching_session_bundle) {
      this.triggerCoachingSessionCompletedEmails(saved.id, saved).catch((err) =>
        this.logger.error(
          `❌ Failed to trigger 'coaching_session_completed' email for id=${saved.id}`,
          err?.message || err,
        ),
      );
      this.triggerCoachingSessionBellNotification(saved.id, saved).catch((err) =>
        this.logger.error(
          `❌ Failed to trigger 'coaching_session_completed' bell notification for id=${saved.id}`,
          err?.message || err,
        ),
      );
    } else {
      this.triggerCommitFulfilledEmails(saved.id, saved).catch((err) =>
        this.logger.error(
          `❌ Failed to trigger 'commit_fulfilled' email for id=${saved.id}`,
          err?.message || err,
        ),
      );
      this.triggerCommitFulfilledBellNotification(saved.id, saved).catch((err) =>
        this.logger.error(
          `❌ Failed to trigger 'commit_fulfilled' bell notification for id=${saved.id}`,
          err?.message || err,
        ),
      );
    }

    return this.transformDates([saved])[0];
  }

  // -- Coordinator Rejection --------------------------------------------------

  /**
   * El coordinator rechaza un iCare en estado pending.
   * Status → rejection_under_review. Se notifica a HR + Management.
   */
  async coordinatorReject(id: string, dto: CoordinatorRejectICareDto): Promise<ICare> {
    this.logger.log(`[icare:${id}] coordinatorReject() invoked, rejected_by=${dto.rejected_by?.employee_number}`);
    const record = await this.iCareRepository.findOne({ where: { id } });
    if (!record) throw new NotFoundException(`ICare record with id ${id} not found`);

    // 2026-08-27: ya no bloquea por urgencia H/C -- el coordinator gestiona el
    // caso completo. Se conserva solo el guard de peer-coordinator (auto-reporte).
    if (record.staff_name?.is_coordinator === true) {
      throw new ForbiddenException('This record is handled exclusively by HR and Management');
    }

    if (record.status !== ICareStatus.PENDING) {
      throw new BadRequestException('Only pending records can be rejected by the coordinator');
    }

    if (record.rejection_override) {
      throw new BadRequestException('This record cannot be rejected again — override is in effect');
    }

    // HR/Mgmt ya revisó y downgradeó este caso — el coordinator ya no puede rechazarlo,
    // solo justificarlo. Ver misma regla en justify(). Defensa en profundidad: el
    // frontend ya oculta el botón (canCoordinatorRejectRecord), esto cubre la API directa.
    if (record.downgraded) {
      throw new ForbiddenException('This case was already reviewed and downgraded by HR/Management — it cannot be rejected by the coordinator, only justified');
    }

    const now = moment().tz('America/Chicago');

    record.coordinator_rejected = true;
    record.coordinator_rejected_by = dto.rejected_by;
    record.coordinator_rejected_date = now.format('YYYY-MM-DD');
    record.coordinator_rejected_time = now.format('HH:mm');
    record.coordinator_rejected_notes = dto.notes ?? null;
    record.coordinator_rejected_attachments = dto.attachments ?? [];
    record.status = ICareStatus.REJECTION_UNDER_REVIEW;

    const saved = await this.iCareRepository.save(record);

    // Pass `record` (not `saved`) so the already-loaded `responsible` relation is available
    this.triggerCoordinatorRejectedEmails(record.id, record).catch((err) =>
      this.logger.error(
        `Failed to trigger 'coordinator_rejected' email for id=${record.id}`,
        err?.message || err,
      ),
    );
    this.triggerCoordinatorRejectedBellNotification(record.id, record, record.coordinator_rejected_by).catch((err) =>
      this.logger.error(
        `❌ Failed to trigger 'coordinator_rejected' bell notification for id=${record.id}`,
        err?.message || err,
      ),
    );

    return this.transformDates([saved])[0];
  }

  /**
   * HR / Management rechaza definitivamente un iCare en estado PENDING.
   * El record pasa directamente a REJECTED (sin pasar por rejection_under_review).
   * Notifica a Coordinator y Staff.
   */
  async hrDirectReject(id: string, dto: HrRejectICareDto): Promise<ICare> {
    const record = await this.iCareRepository.findOne({ where: { id } });
    if (!record) throw new NotFoundException(`ICare record with id ${id} not found`);

    if (record.status !== ICareStatus.PENDING) {
      throw new BadRequestException('Only pending records can be directly rejected by HR/Management');
    }

    const now = moment().tz('America/Chicago');

    record.coordinator_rejected = true;
    record.coordinator_rejected_by = dto.rejected_by;
    record.coordinator_rejected_date = now.format('YYYY-MM-DD');
    record.coordinator_rejected_time = now.format('HH:mm');
    record.coordinator_rejected_notes = dto.notes ?? null;
    record.coordinator_rejected_attachments = dto.attachments ?? [];
    record.status = ICareStatus.REJECTED;

    const saved = await this.iCareRepository.save(record);

    this.triggerHrRejectedEmails(saved.id, saved).catch((err) =>
      this.logger.error(
        `Failed to trigger 'hr_rejected' emails for id=${saved.id}`,
        err?.message || err,
      ),
    );

    return this.transformDates([saved])[0];
  }

  /**
   * HR / Management revisa el rejected del coordinator.
   * accept=true  -> status REJECTED (final).
   * accept=false -> override: el caso vuelve SIEMPRE al coordinator (status PENDING), sin
   *   importar la urgency -- ya no se le pide a HR/Mgmt (la reason ya la fijo desde que se
   *   creo/edito el record, ver resolveUrgencyForReason()). rejection_override=true bloquea
   *   que el coordinator lo vuelva a rechazar (ver guard en justify()); solo puede
   *   justificarlo para que avance a staff.
   * 2026-08-28: antes High/Critical se quedaba con HR/Mgmt via PENDING_HR_JUSTIFY -- ya no
   * aplica (el coordinator gestiona H/C de punta a punta desde el cambio del 27). Ese status
   * queda solo para procesar backlog de casos anteriores a esta fecha.
   */
  async reviewRejection(id: string, dto: ReviewRejectionICareDto): Promise<ICare> {
    const record = await this.iCareRepository.findOne({ where: { id } });
    if (!record) throw new NotFoundException(`ICare record with id ${id} not found`);

    if (record.status !== ICareStatus.REJECTION_UNDER_REVIEW) {
      throw new BadRequestException('Record is not pending rejection review');
    }

    const now = moment().tz('America/Chicago');

    record.rejection_reviewed = true;
    record.rejection_review_accepted = dto.accept;
    record.rejection_reviewed_by = dto.reviewed_by;
    record.rejection_review_date = now.format('YYYY-MM-DD');
    record.rejection_review_time = now.format('HH:mm');
    record.rejection_review_notes = dto.notes ?? null;
    record.rejection_review_attachments = dto.attachments ?? [];

    if (dto.accept) {
      // Aceptar el rejected -> queda rechazado de forma definitiva
      record.status = ICareStatus.REJECTED;
    } else {
      // 2026-08-28: override ya no le pide/asigna urgency -- la fijo la reason desde que
      // se creo/edito el record. El caso SIEMPRE vuelve al coordinator (antes High/Critical
      // se quedaba con HR/Mgmt via PENDING_HR_JUSTIFY; ya no aplica, ver JSDoc arriba).
      record.rejection_override = true;
      record.status = ICareStatus.PENDING;
    }

    const saved = await this.iCareRepository.save(record);

    this.triggerRejectionReviewedEmails(saved.id, saved, dto.accept).catch((err) =>
      this.logger.error(
        `Failed to trigger 'rejection_reviewed' email for id=${saved.id}`,
        err?.message || err,
      ),
    );
    this.triggerRejectionReviewedBellNotification(saved.id, saved, dto.accept).catch((err) =>
      this.logger.error(
        `❌ Failed to trigger 'rejection_reviewed' bell notification for id=${saved.id}`,
        err?.message || err,
      ),
    );

    return this.transformDates([saved])[0];
  }

  // -- Creation Review (caso "propio personal") --------------------------------

  /**
   * HR / Management revisan la CREACIÓN de un iCare levantado por un coordinator
   * sobre su propio personal (submitter está dentro de responsible[] del staff).
   * Este paso SOLO legitima la creación — no toca urgency ni justifica nada.
   *
   * action='approve' → status vuelve a PENDING (sin justified, sin urgency). El
   *                     caso es visible de nuevo para el coordinator, que hace su
   *                     PROPIO Justify con el flujo normal ya existente (ahí decide
   *                     la urgency y, si es High/Critical, ese mismo justify() ya
   *                     lo manda a PENDING_HR_REVIEW — no hay que duplicar esa
   *                     lógica aquí).
   * action='reject'  → status pasa directo a REJECTED. No regresa al coordinator.
   *
   * (No confundir con reviewRejection(): ese es un flujo aparte — coordinator
   * rechaza un pending, HR/Mgmt revisa el rechazo y ahí SÍ elige urgency si hace
   * override. Ese método no se toca.)
   */
  async reviewCreation(id: string, dto: ReviewCreationICareDto): Promise<ICare> {
    const record = await this.iCareRepository.findOne({ where: { id } });
    if (!record) throw new NotFoundException(`ICare record with id ${id} not found`);

    if (record.status !== ICareStatus.PENDING_CREATION_REVIEW) {
      throw new BadRequestException('Record is not pending creation review');
    }

    const now = moment().tz('America/Chicago');

    record.creation_reviewed = true;
    record.creation_review_approved = dto.action === 'approve';
    record.creation_reviewed_by = dto.reviewed_by;
    record.creation_review_date = now.format('YYYY-MM-DD');
    record.creation_review_time = now.format('HH:mm');
    record.creation_review_notes = dto.notes ?? null;
    record.creation_review_attachments = dto.attachments ?? [];

    record.status = dto.action === 'approve' ? ICareStatus.PENDING : ICareStatus.REJECTED;

    const saved = await this.iCareRepository.save(record);

    if (dto.action === 'approve') {
      // El staff NO se notifica aquí — eso ocurre cuando el coordinator haga su
      // propio Justify.
      this.triggerCreationApprovedEmails(saved.id, saved).catch((err) =>
        this.logger.error(`Failed to trigger 'creation_approved' emails for id=${saved.id}`, err?.message || err),
      );
    } else {
      this.triggerCreationRejectedEmails(saved.id, saved).catch((err) =>
        this.logger.error(`Failed to trigger 'creation_rejected' emails for id=${saved.id}`, err?.message || err),
      );
    }

    return this.transformDates([saved])[0];
  }

  /**
   * Notifica que HR/Management APROBARON la creación — el caso vuelve al coordinator.
   * Destinatarios: coordinator(s) asignados + HR + Management (no el submitter directamente,
   * ya que el submitter normalmente ES uno de los coordinator(s) asignados).
   */
  private async triggerCreationApprovedEmails(id: string, record: ICare): Promise<void> {
    const [hrEmails, managementEmails, hrAssistantEmails] = await Promise.all([
      this.getEmailsByRole('hr'),
      this.getEmailsByRole('management'),
      this.getEmailsByAnyRole('hr-assistant'),
    ]);
    const allHrEmails = [...hrEmails, ...hrAssistantEmails];
    const coordinatorEmails = (record.responsible ?? []).map(r => r.nova_email).filter(Boolean);

    const sends: Promise<void>[] = [];
    if (coordinatorEmails.length > 0) sends.push(this.triggerEmail(id, 'creation_approved_coordinator', coordinatorEmails));
    if (allHrEmails.length > 0) sends.push(this.triggerEmail(id, 'creation_approved_hr', allHrEmails));
    if (managementEmails.length > 0 && ICareService.isHighCriticalUrgency(record)) sends.push(this.triggerEmail(id, 'creation_approved_management', managementEmails));
    await Promise.all(sends);
  }

  /**
   * Notifica que HR/Management RECHAZARON la creación — el caso queda REJECTED definitivo.
   * Destinatarios: submitter + coordinator(s) asignados + HR + Management.
   */
  private async triggerCreationRejectedEmails(id: string, record: ICare): Promise<void> {
    const [hrEmails, managementEmails, hrAssistantEmails] = await Promise.all([
      this.getEmailsByRole('hr'),
      this.getEmailsByRole('management'),
      this.getEmailsByAnyRole('hr-assistant'),
    ]);
    const allHrEmails = [...hrEmails, ...hrAssistantEmails];
    const submitterEmail = record.submitter?.nova_email ?? null;
    const coordinatorEmails = (record.responsible ?? []).map(r => r.nova_email).filter(Boolean);

    const sends: Promise<void>[] = [];
    if (submitterEmail) sends.push(this.triggerEmail(id, 'creation_rejected_staff', [submitterEmail]));
    if (coordinatorEmails.length > 0) sends.push(this.triggerEmail(id, 'creation_rejected_coordinator', coordinatorEmails));
    if (allHrEmails.length > 0) sends.push(this.triggerEmail(id, 'creation_rejected_hr', allHrEmails));
    if (managementEmails.length > 0 && ICareService.isHighCriticalUrgency(record)) sends.push(this.triggerEmail(id, 'creation_rejected_management', managementEmails));
    await Promise.all(sends);
  }

  // -- Search -----------------------------------------------------------------

  /**
   * Busqueda full-text sobre multiples campos del iCare.
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

  // -- Batch operations --

  /**
   * Actualiza en bulk multiples registros iCare por sus UUIDs.
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
   * Elimina en bulk multiples registros iCare por sus UUIDs.
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

  // ============================================================================
  // -- Bulk Import (Excel) -------------------------------------------------------
  // GET /i-care/template/excel  -> genera una plantilla de EJEMPLO (10 filas
  //   sinteticas, 5 "New" y 5 "Completed") para que HR vea el formato esperado
  //   por /import/excel antes de cargar datos reales. Las "Reason" de las filas
  //   de ejemplo se toman en vivo del catalogo i_care_reason (misma tabla que
  //   valida create()/resolveUrgencyForReason) para que el archivo generado
  //   siempre sea importable sin ajustes manuales.
  // POST /i-care/import/excel   -> crea registros iCare en bulk desde un Excel
  //   con ese mismo formato.
  //
  // DECISION DE DISENO: esto NO reutiliza create()/justify()/commit()/
  // approveCommit()/addSeguimiento()/fulfillCommit()/resolve() -- esos metodos
  // disparan emails y campanas reales a Staff/Coordinator/HR/Management en
  // cada paso (ver triggerCreatedEmails, triggerJustifiedEmails, etc. mas
  // arriba en este archivo). Un import masivo de datos de EJEMPLO/seed no debe
  // notificar a personas reales sobre casos ficticios. Por eso las filas
  // "Completed" arman el registro ya resuelto directamente contra el
  // repositorio (status SOLVED + el trail justified/committed/commit_approved/
  // seguimientos/commit_fulfilled/resolved ya poblado), sin pasar por el state
  // machine ni sus notificaciones -- ver seedAsCompleted() abajo. Si en el
  // futuro se necesita un import "real" (no de ejemplo) que SI dispare
  // notificaciones, debe ser un flujo separado que llame a los metodos de
  // arriba registro por registro, no una extension de este.
  // ============================================================================

  private static readonly IMPORT_STATUS_LABELS: Record<'new' | 'completed', string[]> = {
    new: ['nuevo', 'new', 'pending', 'pendiente'],
    completed: ['completado', 'completed', 'solved', 'resuelto', 'resolved'],
  };

  private static normalizeImportStatus(raw: string): 'new' | 'completed' | null {
    const key = raw.trim().toLowerCase();
    if (!key) return 'new'; // fila sin status explicito -> se trata como "New"
    if (ICareService.IMPORT_STATUS_LABELS.new.includes(key)) return 'new';
    if (ICareService.IMPORT_STATUS_LABELS.completed.includes(key)) return 'completed';
    return null;
  }

  async generateImportTemplate(res: Response): Promise<void> {
    const reasons = await this.iCareReasonRepository.find();
    const usableReasons = reasons.filter(r => !!r.urgency);
    const pickReason = (i: number): ICareReason | null =>
      usableReasons.length ? usableReasons[i % usableReasons.length] : null;

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Nova API';
    workbook.created = new Date();

    // Paleta y bordes reutilizados en ambas hojas para que el archivo se vea
    // como un documento profesional (encabezado con relleno, zebra striping,
    // contornos suaves, texto envuelto) en vez de una hoja cruda sin estilo.
    const HEADER_FILL = 'FF1E293B'; // slate-800
    const HEADER_FONT_COLOR = 'FFFFFFFF';
    const ZEBRA_FILL = 'FFF1F5F9'; // slate-100
    const BORDER_COLOR = 'FFCBD5E1'; // slate-300
    const THIN_BORDER = {
      top: { style: 'thin' as const, color: { argb: BORDER_COLOR } },
      left: { style: 'thin' as const, color: { argb: BORDER_COLOR } },
      bottom: { style: 'thin' as const, color: { argb: BORDER_COLOR } },
      right: { style: 'thin' as const, color: { argb: BORDER_COLOR } },
    };

    // ── Instructions sheet ──────────────────────────────────────────────────
    const instructions = workbook.addWorksheet('Instructions', {
      views: [{ showGridLines: false }],
    });
    instructions.columns = [{ width: 110 }];

    const titleRow = instructions.addRow(['iCare - Bulk import template']);
    titleRow.height = 32;
    titleRow.getCell(1).font = { bold: true, size: 16, color: { argb: HEADER_FONT_COLOR } };
    titleRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } };
    titleRow.getCell(1).alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };

    instructions.addRow(['']);

    [
      'Fill one row per iCare in the "iCare Import" sheet, then upload it from the iCare view ("Upload Excel").',
      'Required columns: Date, Submitter Employee Number/Name/Last Name/Email, Reason, Details.',
      'Reason must match EXACTLY an entry already registered in "Reasons I Care" -- urgency is derived from it automatically and cannot be set here.',
      'Status accepts "New" (creates the case pending, like a normal submission) or "Completed" (creates it already resolved, for demos/testing). Neither option sends emails or notifications.',
      'Staff / Responsible columns are optional but recommended -- replace the sample NOVAEX-xxx people with real employees before importing for real use.',
      'Department, Staff Type and Multi Position accept comma-separated values when there is more than one.',
    ].forEach((line) => {
      const row = instructions.addRow([line]);
      row.height = 34;
      const cell = row.getCell(1);
      cell.font = { size: 11, color: { argb: 'FF334155' } };
      cell.alignment = { wrapText: true, vertical: 'middle', indent: 1 };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
      cell.border = THIN_BORDER;
    });

    // ── iCare Import sheet ──────────────────────────────────────────────────
    const sheet = workbook.addWorksheet('iCare Import', {
      views: [{ state: 'frozen', ySplit: 1 }],
    });
    sheet.columns = [
      { header: 'Date (YYYY-MM-DD)', key: 'date', width: 16 },
      { header: 'Submitter Employee Number', key: 'submitter_number', width: 22 },
      { header: 'Submitter Name', key: 'submitter_name', width: 18 },
      { header: 'Submitter Last Name', key: 'submitter_last_name', width: 18 },
      { header: 'Submitter Email', key: 'submitter_email', width: 28 },
      { header: 'Staff Employee Number', key: 'staff_number', width: 20 },
      { header: 'Staff Name', key: 'staff_name', width: 18 },
      { header: 'Staff Last Name', key: 'staff_last_name', width: 18 },
      { header: 'Staff Email', key: 'staff_email', width: 28 },
      { header: 'Responsible Employee Number', key: 'resp_number', width: 24 },
      { header: 'Responsible Name', key: 'resp_name', width: 18 },
      { header: 'Responsible Last Name', key: 'resp_last_name', width: 18 },
      { header: 'Responsible Email', key: 'resp_email', width: 28 },
      { header: 'Department', key: 'department', width: 20 },
      { header: 'Staff Type', key: 'staffType', width: 18 },
      { header: 'Multi Position', key: 'multi_position', width: 18 },
      { header: 'Reason', key: 'reason', width: 32 },
      { header: 'Details', key: 'details', width: 45 },
      { header: 'DN Account Link', key: 'dnAccountLink', width: 20 },
      { header: 'Account Phone', key: 'accountPhone', width: 16 },
      { header: 'Status (example)', key: 'status', width: 18 },
    ];

    const headerRow = sheet.getRow(1);
    headerRow.height = 30;
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: HEADER_FONT_COLOR } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } };
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      cell.border = THIN_BORDER;
    });
    sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: sheet.columns.length } };

    // Nombres de ejemplo (claramente ficticios, no PII real) solo para dar
    // variedad fila a fila -- se rotan entre submitter/staff/responsible con
    // offsets distintos para que no se repita la misma persona en los 3 roles
    // dentro de una misma fila.
    const EXAMPLE_PEOPLE = [
      ['Ana', 'Ramirez'], ['Luis', 'Herrera'], ['Sofia', 'Castillo'], ['Diego', 'Morales'],
      ['Valentina', 'Reyes'], ['Carlos', 'Mendoza'], ['Camila', 'Ortiz'], ['Andres', 'Salazar'],
      ['Isabella', 'Vargas'], ['Miguel', 'Cordero'],
    ];

    const today = moment().tz('America/Chicago');
    for (let i = 0; i < 10; i++) {
      const isCompleted = i % 2 === 1; // alterna: 5 "New", 5 "Completed"
      const reason = pickReason(i);
      const reasonText = reason?.reason ?? 'REPLACE WITH A VALID REASON FROM "REASONS I CARE"';
      const date = today.clone().subtract(isCompleted ? 15 + i : i, 'days').format('YYYY-MM-DD');
      const n = i + 1;

      const [subName, subLast] = EXAMPLE_PEOPLE[i % EXAMPLE_PEOPLE.length];
      const [staffFirst, staffLast] = EXAMPLE_PEOPLE[(i + 3) % EXAMPLE_PEOPLE.length];
      const [respName, respLast] = EXAMPLE_PEOPLE[(i + 6) % EXAMPLE_PEOPLE.length];

      const row = sheet.addRow({
        date,
        // NOVAEX = prefijo reservado para ejemplos de este template -- no
        // coincide con ningun prefijo real usado en produccion (NOVAIC,
        // NOVATC, NOVAMT, etc.), asi no choca con employee_number reales.
        submitter_number: `NOVAEX${1000 + i}`,
        submitter_name: subName,
        submitter_last_name: subLast,
        submitter_email: `${subName.toLowerCase()}.${subLast.toLowerCase()}@novadriving.com`,
        staff_number: `NOVAEX${2000 + i}`,
        staff_name: staffFirst,
        staff_last_name: staffLast,
        staff_email: `${staffFirst.toLowerCase()}.${staffLast.toLowerCase()}@novadriving.com`,
        resp_number: `NOVAEX${3000 + i}`,
        resp_name: respName,
        resp_last_name: respLast,
        resp_email: `${respName.toLowerCase()}.${respLast.toLowerCase()}@novadriving.com`,
        // department/staffType/multi_position NO vienen de un catalogo propio --
        // en ICareForm.vue se auto-copian del empleado seleccionado (multi_department,
        // multi_type_of_job, multi_position respectivamente). Se usan aqui valores
        // reales de ejemplo (mismo formato que aparece en produccion) en vez de
        // placeholders inventados.
        department: 'Information Technology Department',
        staffType: 'Admin Staff - Remote',
        multi_position: 'Specialist',
        reason: reasonText,
        details: isCompleted
          ? `Caso de ejemplo: "${reasonText}" reportado el ${date} sobre el staff indicado. Se le dio seguimiento y se cerro siguiendo el flujo normal (justificacion, compromiso, seguimiento y resolucion).`
          : `Caso de ejemplo: "${reasonText}" reportado el ${date} sobre el staff indicado. Pendiente de revision.`,
        dnAccountLink: '',
        accountPhone: '',
        status: isCompleted ? 'Completed' : 'New',
      });

      // Estilo por fila: bordes + wrap en todas las celdas, zebra striping
      // cada 2 filas, y la columna Status resaltada en verde/azul segun el
      // valor para que se distinga de un vistazo cual fila es cual.
      row.height = 46;
      row.eachCell((cell) => {
        cell.border = THIN_BORDER;
        cell.alignment = { wrapText: true, vertical: 'top' };
        if (n % 2 === 0) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ZEBRA_FILL } };
        }
      });

      const statusCell = row.getCell('status');
      statusCell.font = { bold: true, color: { argb: isCompleted ? 'FF065F46' : 'FF1E40AF' } };
      statusCell.fill = {
        type: 'pattern', pattern: 'solid',
        fgColor: { argb: isCompleted ? 'FFD1FAE5' : 'FFDBEAFE' },
      };
      statusCell.alignment = { wrapText: true, vertical: 'middle', horizontal: 'center' };
    }

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader('Content-Disposition', 'attachment; filename="i-care-import-template.xlsx"');

    await workbook.xlsx.write(res);
    res.end();
  }

  async importExcel(buffer: Buffer): Promise<ImportICareResult> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);

    const sheet =
      workbook.getWorksheet('iCare Import') ??
      workbook.worksheets.find(ws => ws.name !== 'Instructions') ??
      workbook.worksheets[0];
    if (!sheet) throw new BadRequestException('The Excel file has no sheets');

    const headerRow = sheet.getRow(1);
    const headers: Record<string, number> = {};
    headerRow.eachCell((cell, colNum) => {
      const key = String(cell.value ?? '').trim().toLowerCase();
      headers[key] = colNum;
    });

    const col = (names: string[]): number | null => {
      for (const n of names) if (headers[n] !== undefined) return headers[n];
      return null;
    };

    const colDate = col(['date (yyyy-mm-dd)', 'date']);
    const colSubNum = col(['submitter employee number']);
    const colSubName = col(['submitter name']);
    const colSubLast = col(['submitter last name']);
    const colSubEmail = col(['submitter email']);
    const colStaffNum = col(['staff employee number']);
    const colStaffName = col(['staff name']);
    const colStaffLast = col(['staff last name']);
    const colStaffEmail = col(['staff email']);
    const colRespNum = col(['responsible employee number']);
    const colRespName = col(['responsible name']);
    const colRespLast = col(['responsible last name']);
    const colRespEmail = col(['responsible email']);
    const colDept = col(['department']);
    const colStaffType = col(['staff type']);
    const colMultiPos = col(['multi position']);
    const colReason = col(['reason']);
    const colDetails = col(['details']);
    const colDnLink = col(['dn account link']);
    const colPhone = col(['account phone']);
    const colStatus = col(['status (example)', 'status']);

    if (!colDate || !colSubNum || !colSubName || !colSubLast || !colSubEmail || !colReason || !colDetails) {
      throw new BadRequestException(
        'Required columns not found: Date, Submitter Employee Number/Name/Last Name/Email, Reason, Details',
      );
    }

    const getCellValue = (row: ExcelJS.Row, colIdx: number | null): string => {
      if (!colIdx) return '';
      const cell = row.getCell(colIdx);
      if (cell.value === null || cell.value === undefined) return '';
      if (cell.value instanceof Date) return moment(cell.value).format('YYYY-MM-DD');
      if (typeof cell.value === 'object' && 'richText' in (cell.value as any)) {
        return (cell.value as any).richText.map((r: any) => r.text).join('');
      }
      return String(cell.value).trim();
    };

    const splitList = (raw: string): string[] =>
      raw.split(',').map(s => s.trim()).filter(Boolean);

    const errors: { row: number; message: string }[] = [];
    let inserted = 0;
    let skipped = 0;

    for (let i = 2; i <= sheet.rowCount; i++) {
      const row = sheet.getRow(i);
      const date = getCellValue(row, colDate);
      const reasonText = getCellValue(row, colReason);
      const details = getCellValue(row, colDetails);
      const submitterNumber = getCellValue(row, colSubNum);

      if (!date && !reasonText && !details && !submitterNumber) continue; // fila vacia

      try {
        if (!date || !reasonText || !details || !submitterNumber) {
          throw new Error('Missing one of the required fields (Date, Submitter Employee Number, Reason, Details)');
        }
        if (!moment(date, 'YYYY-MM-DD', true).isValid()) {
          throw new Error(`Invalid date "${date}" -- expected YYYY-MM-DD`);
        }

        const statusFlag = ICareService.normalizeImportStatus(getCellValue(row, colStatus));
        if (statusFlag === null) {
          throw new Error('Invalid Status value -- expected "New" or "Completed"');
        }

        const urgency = await this.resolveUrgencyForReason(reasonText);
        const offenseCategory = await this.resolveOffenseCategoryForReason(reasonText);

        const submitter = {
          employee_number: submitterNumber,
          name: getCellValue(row, colSubName),
          last_name: getCellValue(row, colSubLast),
          nova_email: getCellValue(row, colSubEmail),
        };
        if (!submitter.name || !submitter.last_name || !submitter.nova_email) {
          throw new Error('Submitter Name, Last Name and Email are required');
        }

        const staffNumber = getCellValue(row, colStaffNum);
        const staff_name = staffNumber
          ? {
              employee_number: staffNumber,
              name: getCellValue(row, colStaffName),
              last_name: getCellValue(row, colStaffLast),
              nova_email: getCellValue(row, colStaffEmail),
            }
          : null;

        const respNumber = getCellValue(row, colRespNum);
        const responsiblePerson = respNumber
          ? {
              employee_number: respNumber,
              name: getCellValue(row, colRespName),
              last_name: getCellValue(row, colRespLast),
              nova_email: getCellValue(row, colRespEmail),
            }
          : null;

        const payload: DeepPartial<ICare> = {
          date,
          submitter,
          staff_name,
          responsible: responsiblePerson ? [responsiblePerson] : [],
          department: colDept ? getCellValue(row, colDept) : '',
          staffType: colStaffType ? splitList(getCellValue(row, colStaffType)) : [],
          multi_position: colMultiPos ? splitList(getCellValue(row, colMultiPos)) : [],
          reason: reasonText,
          details,
          dnAccountLink: colDnLink ? (getCellValue(row, colDnLink) || undefined) : undefined,
          accountPhone: colPhone ? (getCellValue(row, colPhone) || undefined) : undefined,
          attachments: [],
          urgency,
          offense_category: offenseCategory,
          status: ICareStatus.PENDING,
        };
        const record = this.iCareRepository.create(payload);

        if (statusFlag === 'completed') {
          this.seedAsCompleted(record, responsiblePerson ?? submitter);
        }

        await this.iCareRepository.save(record);
        inserted++;
      } catch (err) {
        errors.push({ row: i, message: err instanceof Error ? err.message : String(err) });
        skipped++;
      }
    }

    return { inserted, skipped, errors };
  }

  /**
   * Puebla el registro con el trail completo justified -> committed ->
   * commit_approved -> seguimiento -> commit_fulfilled -> resolved, dejandolo
   * en SOLVED. Usado SOLO por importExcel() para filas "Completed" -- ver
   * nota de diseno en el bloque de arriba (no dispara notificaciones).
   */
  private seedAsCompleted(
    record: ICare,
    actor: { name: string; last_name: string; employee_number: string; nova_email: string },
  ): void {
    const base = moment(record.date, 'YYYY-MM-DD');
    const at = (days: number) => base.clone().add(days, 'days');
    const noteSuffix = '(sample record imported from the bulk template)';

    record.justified = true;
    record.justified_approved_by = actor;
    record.justified_date = at(0).format('YYYY-MM-DD');
    record.justified_time = '09:00';
    record.justified_comments = [`Justified ${noteSuffix}`];

    record.committed = true;
    record.committed_date = at(1).format('YYYY-MM-DD');
    record.committed_time = '09:00';
    record.committed_notes = `Committed ${noteSuffix}`;

    record.commit_approved = true;
    record.commit_approved_by = actor;
    record.commit_approved_date = at(2).format('YYYY-MM-DD');
    record.commit_approved_time = '09:00';
    record.commit_approved_notes = `Commit approved ${noteSuffix}`;

    record.seguimientos = [
      {
        id: `seg_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
        scheduled_date: at(2).format('YYYY-MM-DD'),
        actual_date: at(7).format('YYYY-MM-DD'),
        notes: `Follow-up completed ${noteSuffix}`,
        added_by: actor,
        created_at: at(7).format('YYYY-MM-DD HH:mm'),
        attachments: [],
      },
    ];
    record.next_followup_scheduled_date = null;

    record.commit_fulfilled = true;
    record.commit_fulfilled_by = actor;
    record.commit_fulfilled_date = at(7).format('YYYY-MM-DD');
    record.commit_fulfilled_time = '09:00';
    record.commit_fulfilled_notes = `Commit fulfilled ${noteSuffix}`;

    record.resolved_by = actor;
    record.resolved_date = at(8).format('YYYY-MM-DD');
    record.resolved_time = '09:00';
    record.resolved_notes = `Resolved ${noteSuffix}`;

    record.status = ICareStatus.SOLVED;
  }

  // ============================================================================
  // -- Analytics ----------------------------------------------------------------
  // Powers GET /i-care/analytics — el dashboard de KPIs/gráficas que se muestra
  // debajo de la tabla en la vista de HR/Coordinator/Management. Toda la
  // agregación corre en Postgres (this.iCareRepository.query) para que el
  // payload sea chico sin importar cuántos registros existan. Mismo patrón que
  // ITTicketsService.analytics() (it_backend/src/it_tickets/it_tickets.service.ts).
  //
  // Rango: from/to son fechas de calendario inclusivas sobre la columna `date`
  // (fecha del reporte — mismo campo que usa getStatistics()), EXCEPTO la
  // serie "solved" del trend, que filtra sobre resolved_date (responde
  // "cuánto se resolvió en el período", no "de lo creado, cuánto se resolvió").
  // department/staffPositions aplican el mismo scoping ILIKE/jsonb que ya usa
  // el resto del módulo para coordinators restringidos.
  // ============================================================================

  private static round1(v: unknown): number | null {
    const n = Number(v);
    return Number.isFinite(n) ? Math.round(n * 10) / 10 : null;
  }

  /** Wrapper con tipo de retorno explícito sobre un QueryRunner ya conectado.
   *  analytics() corre TODAS sus queries en serie sobre un único QueryRunner
   *  (una sola conexión del pool) — ver nota en analytics(). */
  private rawQuery(queryRunner: QueryRunner, sql: string, params: any[] = []): Promise<any[]> {
    return queryRunner.query(sql, params);
  }

  /** Elige una granularidad de trend que mantenga el gráfico legible. */
  private static autoAnalyticsBucket(from?: string, to?: string): 'day' | 'week' | 'month' {
    if (!from) return 'month';
    const start = new Date(`${from}T00:00:00Z`).getTime();
    const end = to ? new Date(`${to}T00:00:00Z`).getTime() : Date.now();
    const days = Math.max(1, (end - start) / 86_400_000);
    if (days <= 62) return 'day';
    if (days <= 366) return 'week';
    return 'month';
  }

  async analytics(query: ICareAnalyticsQueryDto) {
    const { from, to } = query;
    if (from && to && from > to) {
      throw new BadRequestException('"from" must be before or equal to "to"');
    }
    const bucket = query.bucket ?? ICareService.autoAnalyticsBucket(from, to);
    const r1 = ICareService.round1;

    // $1=from $2=to — mismas posiciones en todas las queries para poder
    // reusar los fragmentos RANGE/RANGE_RESOLVED tal cual.
    const P: (string | null)[] = [from ?? null, to ?? null];

    const depts = (query.department ?? '').split(',').map(d => d.trim()).filter(Boolean);
    const deptConds: string[] = [];
    for (const d of depts) {
      P.push(`%${d}%`);
      deptConds.push(`i.department ILIKE $${P.length}`);
    }
    const DEPT_SCOPE = deptConds.length ? `AND (${deptConds.join(' OR ')})` : '';

    const positions = (query.staffPositions ?? '').split(',').map(p => p.trim()).filter(Boolean);
    let POS_SCOPE = '';
    if (positions.length) {
      P.push(positions as any);
      POS_SCOPE = `AND i.multi_position::jsonb ?| $${P.length}::text[]`;
    }

    // Inclusive [from, to] sobre `date` (fecha de creación del reporte).
    // `date` es varchar (YYYY-MM-DD), no un tipo date nativo — se compara como
    // string, igual que el resto del módulo (ver applyDeptFilter/dateFrom-dateTo
    // en getStatistics()). Los strings ISO ordenan igual lexicográficamente.
    const RANGE = `
      ($1::text IS NULL OR i.date >= $1::text)
      AND ($2::text IS NULL OR i.date <= $2::text)
      ${DEPT_SCOPE} ${POS_SCOPE}`;

    // Mismo rango pero sobre resolved_date (varchar también) — para la serie
    // "solved" del trend.
    const RANGE_RESOLVED = `
      i.resolved_date IS NOT NULL
      AND ($1::text IS NULL OR i.resolved_date >= $1::text)
      AND ($2::text IS NULL OR i.resolved_date <= $2::text)
      ${DEPT_SCOPE} ${POS_SCOPE}`;

    // resolved_date/resolved_time y justified_date/justified_time son varchar
    // (no timestamptz) — se guardan ya en business timezone (America/Chicago),
    // así que hay que llevar createdAt a esa misma zona antes de restar.
    const RES_HOURS = `EXTRACT(EPOCH FROM (
      (i.resolved_date || ' ' || COALESCE(i.resolved_time, '00:00'))::timestamp
      - (i."createdAt" AT TIME ZONE 'America/Chicago')
    )) / 3600.0`;
    const JUSTIFY_HOURS = `EXTRACT(EPOCH FROM (
      (i.justified_date || ' ' || COALESCE(i.justified_time, '00:00'))::timestamp
      - (i."createdAt" AT TIME ZONE 'America/Chicago')
    )) / 3600.0`;

    const bucketParamIdx = P.length + 1;
    const PB = [...P, bucket];

    this.logger.log(`[analytics] from=${from ?? '-'} to=${to ?? '-'} bucket=${bucket}`);

    // Antes estas ~11 queries se disparaban en paralelo con Promise.all, y
    // cada this.iCareRepository.query() sin QueryRunner explícito toma su
    // propia conexión del pool de forma independiente — una sola carga del
    // dashboard llegaba a pedir hasta 11 conexiones simultáneas. En un
    // Postgres administrado con max_connections compartido entre todos los
    // backends del monorepo (hr_backend, it_backend, etc.), eso agotaba el
    // pool ("remaining connection slots are reserved for roles with the
    // SUPERUSER attribute"). Corriendo todo en serie sobre un único
    // QueryRunner, este endpoint nunca usa más de 1 conexión a la vez.
    const queryRunner = this.iCareRepository.manager.connection.createQueryRunner();
    let connected = false;

    try {
      await queryRunner.connect();
      connected = true;

      // 1. Volumen + status mix + tiempos de resolución/justificación
      const [summary] = await this.rawQuery(
        queryRunner,
        `SELECT
             COUNT(*)::int AS total,
             COUNT(*) FILTER (WHERE i.status = 'solved')::int AS solved,
             COUNT(*) FILTER (WHERE i.status = 'rejected')::int AS rejected,
             COUNT(*) FILTER (WHERE i.status = 'in_progress')::int AS in_progress,
             COUNT(*) FILTER (WHERE i.status = 'pending')::int AS pending,
             COUNT(*) FILTER (WHERE i.status = 'following_up')::int AS following_up,
             COUNT(*) FILTER (WHERE i.status = 'commit_fulfilled')::int AS commit_fulfilled,
             COUNT(*) FILTER (WHERE i.status = 'pending_hr_review')::int AS pending_hr_review,
             COUNT(*) FILTER (WHERE i.status = 'pending_hr_justify')::int AS pending_hr_justify,
             COUNT(*) FILTER (WHERE i.status = 'rejection_under_review')::int AS rejection_under_review,
             COUNT(*) FILTER (WHERE i.status = 'pending_creation_review')::int AS pending_creation_review,
             COUNT(*) FILTER (WHERE i.committed)::int AS committed,
             COUNT(*) FILTER (WHERE i.urgency IN ('High','Critical') AND i.status NOT IN ('solved','rejected'))::int AS critical_active,
             AVG(${RES_HOURS}) FILTER (WHERE i.status = 'solved' AND i.resolved_date IS NOT NULL) AS avg_resolution_hours,
             PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ${RES_HOURS})
               FILTER (WHERE i.status = 'solved' AND i.resolved_date IS NOT NULL) AS median_resolution_hours,
             AVG(${JUSTIFY_HOURS}) FILTER (WHERE i.justified_date IS NOT NULL) AS avg_time_to_justify_hours
           FROM i_care i
           WHERE ${RANGE}`,
        P,
      );

      // 2. Distribución por urgency
      const byUrgency = await this.rawQuery(
        queryRunner,
        `SELECT COALESCE(i.urgency::text, 'None') AS urgency, COUNT(*)::int AS count
           FROM i_care i WHERE ${RANGE}
           GROUP BY 1 ORDER BY count DESC`,
        P,
      );

      // 3. Distribución por status
      const byStatus = await this.rawQuery(
        queryRunner,
        `SELECT i.status::text AS status, COUNT(*)::int AS count
           FROM i_care i WHERE ${RANGE}
           GROUP BY 1 ORDER BY count DESC`,
        P,
      );

      // 4. Por departamento (volumen + tiempo de resolución promedio)
      const byDepartment = await this.rawQuery(
        queryRunner,
        `SELECT COALESCE(NULLIF(i.department, ''), 'Unassigned') AS department,
                  COUNT(*)::int AS count,
                  AVG(${RES_HOURS}) FILTER (WHERE i.status = 'solved' AND i.resolved_date IS NOT NULL) AS avg_resolution_hours
           FROM i_care i WHERE ${RANGE}
           GROUP BY 1 ORDER BY count DESC LIMIT 15`,
        P,
      );

      // 5. Top reasons
      const byReason = await this.rawQuery(
        queryRunner,
        `SELECT i.reason AS reason, COUNT(*)::int AS count
           FROM i_care i WHERE ${RANGE}
           GROUP BY 1 ORDER BY count DESC LIMIT 10`,
        P,
      );

      // 6. Por posición del staff afectado (Operator/Instructor/Teacher)
      const byStaffPosition = await this.rawQuery(
        queryRunner,
        `SELECT pos AS position, COUNT(*)::int AS count
           FROM i_care i
           CROSS JOIN LATERAL jsonb_array_elements_text(COALESCE(i.multi_position, '[]'::jsonb)) AS pos
           WHERE ${RANGE}
           GROUP BY 1 ORDER BY count DESC`,
        P,
      );

      // 7. Funnel de rejection: coordinator reject -> HR review (confirm / override L-M / override H-C).
      // hr_direct_or_awaiting_review agrupa tanto los hr-direct-reject (que reusan
      // coordinator_rejected sin pasar por rejection_reviewed) como los que aún
      // están esperando el review de HR/Mgmt.
      const [rejectionFunnel] = await this.rawQuery(
        queryRunner,
        `SELECT
             COUNT(*) FILTER (WHERE i.coordinator_rejected)::int AS coordinator_rejected_total,
             COUNT(*) FILTER (WHERE i.coordinator_rejected AND NOT i.rejection_reviewed)::int AS hr_direct_or_awaiting_review,
             COUNT(*) FILTER (WHERE i.rejection_reviewed AND i.rejection_review_accepted = true)::int AS hr_confirmed,
             COUNT(*) FILTER (WHERE i.rejection_reviewed AND i.rejection_review_accepted = false AND i.urgency IN ('Low','Medium'))::int AS hr_overridden_low_medium,
             COUNT(*) FILTER (WHERE i.rejection_reviewed AND i.rejection_review_accepted = false AND i.urgency IN ('High','Critical'))::int AS hr_overridden_high_critical
           FROM i_care i WHERE ${RANGE}`,
        P,
      );

      // 8. Funnel de escalation: coordinator justifica H/C -> HR decide (accept / downgrade / reject)
      const [escalationFunnel] = await this.rawQuery(
        queryRunner,
        `SELECT
             COUNT(*) FILTER (WHERE i.escalated)::int AS escalated_total,
             COUNT(*) FILTER (WHERE i.escalated AND i.status = 'pending_hr_review')::int AS awaiting_hr_decision,
             COUNT(*) FILTER (WHERE i.escalated AND i.downgraded)::int AS downgraded,
             COUNT(*) FILTER (WHERE i.escalated AND NOT i.downgraded AND i.status = 'rejected')::int AS rejected_hc,
             COUNT(*) FILTER (WHERE i.escalated AND NOT i.downgraded AND i.status NOT IN ('pending_hr_review','rejected'))::int AS accepted_hc
           FROM i_care i WHERE ${RANGE}`,
        P,
      );

      // 9a. Trend: creados por bucket
      const createdTrend = await this.rawQuery(
        queryRunner,
        `SELECT to_char(date_trunc($${bucketParamIdx}, i.date::timestamp), 'YYYY-MM-DD') AS bucket,
                  COUNT(*)::int AS count
           FROM i_care i WHERE ${RANGE}
           GROUP BY 1 ORDER BY 1`,
        PB,
      );

      // 9b. Trend: solved por bucket (sobre resolved_date, no sobre date)
      const solvedTrend = await this.rawQuery(
        queryRunner,
        `SELECT to_char(date_trunc($${bucketParamIdx}, i.resolved_date::timestamp), 'YYYY-MM-DD') AS bucket,
                  COUNT(*)::int AS count
           FROM i_care i WHERE ${RANGE_RESOLVED}
           GROUP BY 1 ORDER BY 1`,
        PB,
      );

      // 10. Top coordinators/HR — quién justifica más casos y qué tan rápido
      const topCoordinators = await this.rawQuery(
        queryRunner,
        `SELECT
             i.justified_approved_by->>'employee_number' AS employee_number,
             MAX(TRIM(CONCAT(i.justified_approved_by->>'name', ' ', i.justified_approved_by->>'last_name'))) AS name,
             COUNT(*)::int AS justified_count,
             AVG(${JUSTIFY_HOURS}) AS avg_time_to_justify_hours
           FROM i_care i
           WHERE ${RANGE} AND i.justified_approved_by IS NOT NULL AND i.justified_date IS NOT NULL
           GROUP BY 1
           ORDER BY justified_count DESC
           LIMIT 10`,
        P,
      );

      // 11. Top staff reportado — quién acumula más iCares en su contra
      const topReportedStaff = await this.rawQuery(
        queryRunner,
        `SELECT
             i.staff_name->>'employee_number' AS employee_number,
             MAX(TRIM(CONCAT(i.staff_name->>'name', ' ', i.staff_name->>'last_name'))) AS name,
             COUNT(*)::int AS count
           FROM i_care i
           WHERE ${RANGE} AND i.staff_name IS NOT NULL
           GROUP BY 1
           ORDER BY count DESC
           LIMIT 10`,
        P,
      );

      const total = Number(summary?.total ?? 0);
      const coordRejectedTotal = Number(rejectionFunnel?.coordinator_rejected_total ?? 0);
      const hrConfirmed = Number(rejectionFunnel?.hr_confirmed ?? 0);
      const hrOverriddenLM = Number(rejectionFunnel?.hr_overridden_low_medium ?? 0);
      const hrOverriddenHC = Number(rejectionFunnel?.hr_overridden_high_critical ?? 0);
      const reviewedRejections = hrConfirmed + hrOverriddenLM + hrOverriddenHC;
      const escalatedTotal = Number(escalationFunnel?.escalated_total ?? 0);

      return {
        range: { from: from ?? null, to: to ?? null, bucket },
        summary: {
          total,
          solved: Number(summary?.solved ?? 0),
          rejected: Number(summary?.rejected ?? 0),
          in_progress: Number(summary?.in_progress ?? 0),
          pending: Number(summary?.pending ?? 0),
          following_up: Number(summary?.following_up ?? 0),
          commit_fulfilled: Number(summary?.commit_fulfilled ?? 0),
          pending_hr_review: Number(summary?.pending_hr_review ?? 0),
          pending_hr_justify: Number(summary?.pending_hr_justify ?? 0),
          rejection_under_review: Number(summary?.rejection_under_review ?? 0),
          pending_creation_review: Number(summary?.pending_creation_review ?? 0),
          committed: Number(summary?.committed ?? 0),
          committed_rate_pct: total > 0 ? r1((Number(summary?.committed ?? 0) / total) * 100) : null,
          critical_active: Number(summary?.critical_active ?? 0),
          resolution_rate_pct: total > 0 ? r1((Number(summary?.solved ?? 0) / total) * 100) : null,
          avg_resolution_hours: r1(summary?.avg_resolution_hours),
          median_resolution_hours: r1(summary?.median_resolution_hours),
          avg_time_to_justify_hours: r1(summary?.avg_time_to_justify_hours),
          coordinator_rejection_rate_pct: total > 0 ? r1((coordRejectedTotal / total) * 100) : null,
          hr_override_rate_pct: reviewedRejections > 0 ? r1(((hrOverriddenLM + hrOverriddenHC) / reviewedRejections) * 100) : null,
          escalation_rate_pct: total > 0 ? r1((escalatedTotal / total) * 100) : null,
        },
        byUrgency: (byUrgency as any[]).map(x => ({ urgency: x.urgency, count: Number(x.count) })),
        byStatus: (byStatus as any[]).map(x => ({ status: x.status, count: Number(x.count) })),
        byDepartment: (byDepartment as any[]).map(x => ({
          department: x.department,
          count: Number(x.count),
          avg_resolution_hours: r1(x.avg_resolution_hours),
        })),
        byReason: (byReason as any[]).map(x => ({ reason: x.reason, count: Number(x.count) })),
        byStaffPosition: (byStaffPosition as any[]).map(x => ({ position: x.position, count: Number(x.count) })),
        rejectionFunnel: {
          pending_review: Number(rejectionFunnel?.hr_direct_or_awaiting_review ?? 0),
          hr_confirmed: hrConfirmed,
          hr_overridden_low_medium: hrOverriddenLM,
          hr_overridden_high_critical: hrOverriddenHC,
          coordinator_rejected_total: coordRejectedTotal,
        },
        escalationFunnel: {
          escalated_total: escalatedTotal,
          awaiting_hr_decision: Number(escalationFunnel?.awaiting_hr_decision ?? 0),
          downgraded: Number(escalationFunnel?.downgraded ?? 0),
          accepted_hc: Number(escalationFunnel?.accepted_hc ?? 0),
          rejected_hc: Number(escalationFunnel?.rejected_hc ?? 0),
        },
        trend: {
          created: (createdTrend as any[]).map(x => ({ bucket: x.bucket, count: Number(x.count) })),
          solved: (solvedTrend as any[]).map(x => ({ bucket: x.bucket, count: Number(x.count) })),
        },
        topCoordinators: (topCoordinators as any[]).map(x => ({
          employee_number: x.employee_number,
          name: x.name || x.employee_number,
          justified_count: Number(x.justified_count),
          avg_time_to_justify_hours: r1(x.avg_time_to_justify_hours),
        })),
        topReportedStaff: (topReportedStaff as any[]).map(x => ({
          employee_number: x.employee_number,
          name: x.name || x.employee_number,
          count: Number(x.count),
        })),
      };
    } catch (error) {
      this.logger.error('Error computing ICare analytics:', error);
      throw error;
    } finally {
      if (connected) await queryRunner.release();
    }
  }

  // -- Private helpers --

  /**
   * Transforma las fechas createdAt y updatedAt de los registros
   * al timezone America/Chicago en formato 'YYYY-MM-DD HH:mm:ss'.
   */
  private transformDates(records: ICare[]): ICare[] {
    return records.map(record => ({
      ...record,
      createdAt: moment(record.createdAt).tz('America/Chicago').format('YYYY-MM-DD HH:mm:ss') as any,
      updatedAt: moment(record.updatedAt).tz('America/Chicago').format('YYYY-MM-DD HH:mm:ss') as any,
    }));
  }
}

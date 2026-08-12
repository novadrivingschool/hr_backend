import { BadRequestException, ForbiddenException, Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, QueryRunner, Repository } from 'typeorm';
import * as moment from 'moment-timezone';
import { Logger } from '@nestjs/common';
import axios from 'axios';

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

// -- Types ----------------------------------------------------------------------

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
  | 'resolved_staff' | 'resolved_coordinator' | 'resolved_hr' | 'resolved_management'
  | 'coordinator_rejected_coordinator' | 'coordinator_rejected_hr' | 'coordinator_rejected_management'
  | 'rejection_review_accepted_coordinator' | 'rejection_review_accepted_hr' | 'rejection_review_accepted_management'
  | 'rejection_review_overridden_staff' | 'rejection_review_overridden_coordinator' | 'rejection_review_overridden_hr' | 'rejection_review_overridden_management'
  | 'rejection_review_accepted_reviewer' | 'rejection_review_overridden_reviewer'
  | 'hr_rejected_hr' | 'hr_rejected_management'
  | 'pending_hr_review_coordinator' | 'pending_hr_review_hr' | 'pending_hr_review_management'
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
  ) { }

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
    // Coordinator does NOT receive email for High/Critical, coordinator-as-staff, or creation-review cases
    if (coordinatorEmails.length > 0 && !isHighCritical && !isCoordinatorCase && !isCreationReviewCase) {
      sends.push(this.triggerEmail(id, 'created_coordinator', coordinatorEmails));
    }
    if (allHrEmails.length > 0 && !isCreationReviewCase) {
      sends.push(this.triggerEmail(id, 'created_hr', allHrEmails));
    }
    if (managementEmails.length > 0 && !isCreationReviewCase) {
      sends.push(this.triggerEmail(id, 'created_management', managementEmails));
    }
    // Notificación específica pidiendo a HR/Management que revisen la CREACIÓN
    // (el coordinator reportó a su propio personal — conflicto de interés).
    if (isCreationReviewCase) {
      // El submitter SIEMPRE debe recibir confirmación de que su reporte fue recibido,
      // aunque el caso quede oculto para el resto (coordinator/HR genérico) hasta la revisión.
      if (staffEmail) sends.push(this.triggerEmail(id, 'creation_review_submitter', [staffEmail]));
      if (allHrEmails.length > 0) sends.push(this.triggerEmail(id, 'creation_review_hr', allHrEmails));
      if (managementEmails.length > 0) sends.push(this.triggerEmail(id, 'creation_review_management', managementEmails));
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
    if (managementEmails.length > 0) sends.push(this.triggerEmail(id, 'justified_management', managementEmails));
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
    if (managementEmails.length > 0) sends.push(this.triggerEmail(id, 'committed_management', managementEmails));
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
    if (managementEmails.length > 0) sends.push(this.triggerEmail(id, 'resolved_management', managementEmails));
    await Promise.all(sends);
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
    if (managementEmails.length > 0) sends.push(this.triggerEmail(id, 'seguimiento_added_management', managementEmails));
    await Promise.all(sends);
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
    if (managementEmails.length > 0) sends.push(this.triggerEmail(id, 'commit_fulfilled_management', managementEmails));
    await Promise.all(sends);
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
    if (managementEmails.length > 0) sends.push(this.triggerEmail(id, 'coordinator_rejected_management', managementEmails));
    await Promise.all(sends);
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
      if (managementEmails.length > 0) sends.push(this.triggerEmail(id, 'rejection_review_accepted_management', managementEmails));
    } else {
      const staffEmail = record.staff_name?.nova_email;
      // Confirmación personal al reviewer
      if (reviewerEmail) sends.push(this.triggerEmail(id, 'rejection_review_overridden_reviewer', [reviewerEmail]));
      if (staffEmail) sends.push(this.triggerEmail(id, 'rejection_review_overridden_staff', [staffEmail]));
      if (coordinatorEmails.length > 0) sends.push(this.triggerEmail(id, 'rejection_review_overridden_coordinator', coordinatorEmails));
      if (allHrEmails.length > 0) sends.push(this.triggerEmail(id, 'rejection_review_overridden_hr', allHrEmails));
      if (managementEmails.length > 0) sends.push(this.triggerEmail(id, 'rejection_review_overridden_management', managementEmails));
    }
    await Promise.all(sends);
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
    if (managementEmails.length > 0) sends.push(this.triggerEmail(id, 'hr_rejected_management', managementEmails));
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
    if (managementEmails.length > 0) sends.push(this.triggerEmail(id, 'pending_hr_review_management', managementEmails));
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
    if (managementEmails.length > 0) sends.push(this.triggerEmail(id, 'hc_accepted_management', managementEmails));
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
    if (managementEmails.length > 0) sends.push(this.triggerEmail(id, 'downgrade_returned_management', managementEmails));
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
      return this.transformDates([record])[0];
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

    // justify() solo aplica a records en 'pending' (flujo normal / post-downgrade / post-override
    // L/M, actuado por el coordinator) o 'pending_hr_justify' (post-override H/C, actuado por HR/Mgmt).
    if (record.status !== ICareStatus.PENDING && record.status !== ICareStatus.PENDING_HR_JUSTIFY) {
      throw new BadRequestException('Record is not in a justifiable state');
    }

    // HR/Mgmt ya revisó este caso (downgrade de H/C a Low/Medium, o override de un rejected
    // del coordinator) y decidió tanto su legitimidad como su urgency final — quien lo justifique
    // (coordinator o HR/Mgmt según el caso) ya no puede rechazarlo ni cambiar la urgency, solo
    // justificarlo/aceptarlo tal cual quedó. Ver stage "Downgrade" (columnas downgraded_*),
    // approveJustification() acción 'downgrade', y reviewRejection() override (rejection_override).
    if (record.downgraded || record.rejection_override) {
      if (dto.justified === false) {
        throw new ForbiddenException('This case was already reviewed by HR/Management — it cannot be rejected, only justified');
      }
      if (dto.urgency && dto.urgency !== record.urgency) {
        throw new ForbiddenException('Urgency was already decided by HR/Management and cannot be changed');
      }
    }

    const now = moment().tz('America/Chicago');

    record.justified = dto.justified;
    record.justified_approved_by = dto.approved_by;
    record.justified_date = now.format('YYYY-MM-DD');
    record.justified_time = now.format('HH:mm');

    // Guardar la urgency seleccionada (coordinator L/M → in_progress; coordinator H/C → pending_hr_review; HR/Mgmt → in_progress).
    // Si el caso fue downgraded u override de un rejected, la urgency ya quedó fija por HR/Mgmt — no se vuelve a tocar.
    if (dto.urgency && dto.justified && !record.downgraded && !record.rejection_override) record.urgency = dto.urgency;

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

    const isCoordinatorRole = dto.caller_role === 'coordinator' || dto.caller_role === 'coordinator-assistant';
    // Se evalúa sobre record.urgency (valor ya persistido en memoria arriba) y no sobre
    // dto.urgency crudo, para que un caso downgraded (que no manda urgency en el payload
    // una vez corregido el frontend) siga evaluando correctamente su urgency real.
    const isHighCriticalUrgency = record.urgency === ICareUrgency.HIGH || record.urgency === ICareUrgency.CRITICAL;

    if (dto.justified) {
      if (isCoordinatorRole && isHighCriticalUrgency) {
        record.status = ICareStatus.PENDING_HR_REVIEW;
        // Snapshot inmutable del momento de la escalación — se setea UNA sola vez.
        // No puede volver a ocurrir para este record (una vez escalado, si HR/Mgmt
        // downgradea la urgency queda bloqueada a Low/Medium — ver record.downgraded
        // arriba — así que justify() nunca vuelve a entrar a este branch).
        if (!record.escalated) {
          record.escalated = true;
          record.escalated_by = dto.approved_by;
          record.escalated_date = now.format('YYYY-MM-DD');
          record.escalated_time = now.format('HH:mm');
          record.escalated_urgency = record.urgency;
          record.escalated_comment = dto.comment ?? null;
          record.escalated_attachments = dto.attachments?.length ? [...dto.attachments] : [];
        }
      } else {
        record.status = ICareStatus.IN_PROGRESS;
      }
    } else {
      record.status = ICareStatus.REJECTION_UNDER_REVIEW;
    }

    const saved = await this.iCareRepository.save(record);

    if (dto.justified) {
      if (isCoordinatorRole && isHighCriticalUrgency) {
        this.triggerPendingHrReviewEmails(saved.id, saved).catch((err) =>
          this.logger.error(`❌ Failed to trigger 'pending_hr_review' emails for id=${saved.id}`, err?.message || err),
        );
      } else {
        this.triggerJustifiedEmails(saved.id, saved).catch((err) =>
          this.logger.error(`❌ Failed to trigger 'justified' emails for id=${saved.id}`, err?.message || err),
        );
      }
    } else {
      this.triggerCoordinatorRejectedEmails(saved.id, saved).catch((err) =>
        this.logger.error(`❌ Failed to trigger 'not_justified' emails for id=${saved.id}`, err?.message || err),
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

    // Notificar a HR + Coordinator + Management cuando el Staff hace commit
    if (dto.committed) {
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
      (record.urgency === ICareUrgency.HIGH || record.urgency === ICareUrgency.CRITICAL || record.staff_name?.is_coordinator === true) &&
      (dto.caller_role === 'coordinator' || dto.caller_role === 'coordinator-assistant')
    ) {
      throw new ForbiddenException('High and Critical records are handled exclusively by HR and Management');
    }

    const now = moment().tz('America/Chicago');

    record.commit_approved = true;
    record.commit_approved_by = dto.approved_by;
    record.commit_approved_date = now.format('YYYY-MM-DD');
    record.commit_approved_time = now.format('HH:mm');
    record.status = ICareStatus.FOLLOWING_UP;

    // Primer seguimiento
    const firstSeguimiento = {
      id: `seg_${Date.now()}`,
      scheduled_date: dto.scheduled_date,
      actual_date: null,
      notes: dto.notes ?? null,
      added_by: dto.approved_by,
      created_at: now.format('YYYY-MM-DD HH:mm'),
      attachments: dto.attachments ?? [],
    };

    record.seguimientos = [firstSeguimiento];

    const saved = await this.iCareRepository.save(record);

    // En la ruta "con seguimiento", el primer seguimiento dispara el email.
    // En "fulfill directo" (is_fulfill_direct=true) el email lo dispara fulfillCommit.
    if (!dto.is_fulfill_direct) {
      this.triggerSeguimientoAddedEmails(saved.id, saved).catch((err) =>
        this.logger.error(
          `❌ Failed to trigger 'seguimiento_added' email for id=${saved.id}`,
          err?.message || err,
        ),
      );
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
      (record.urgency === ICareUrgency.HIGH || record.urgency === ICareUrgency.CRITICAL || record.staff_name?.is_coordinator === true) &&
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

    const saved = await this.iCareRepository.save(record);

    this.triggerSeguimientoAddedEmails(saved.id, saved).catch((err) =>
      this.logger.error(
        `❌ Failed to trigger 'seguimiento_added' email for id=${saved.id}`,
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
      (record.urgency === ICareUrgency.HIGH || record.urgency === ICareUrgency.CRITICAL || record.staff_name?.is_coordinator === true) &&
      (dto.caller_role === 'coordinator' || dto.caller_role === 'coordinator-assistant')
    ) {
      throw new ForbiddenException('High and Critical records are handled exclusively by HR and Management');
    }

    const now = moment().tz('America/Chicago');

    record.commit_fulfilled = true;
    record.commit_fulfilled_by = dto.fulfilled_by;
    record.commit_fulfilled_date = now.format('YYYY-MM-DD');
    record.commit_fulfilled_time = now.format('HH:mm');
    record.commit_fulfilled_notes = dto.notes ?? null;
    record.commit_fulfilled_attachments = dto.attachments ?? [];
    record.status = ICareStatus.COMMIT_FULFILLED;

    // Si se provee actual_date para el último seguimiento, actualizarlo
    if (dto.actual_date && record.seguimientos?.length) {
      const updated = [...record.seguimientos];
      updated[updated.length - 1] = { ...updated[updated.length - 1], actual_date: dto.actual_date };
      record.seguimientos = updated;
    }

    const saved = await this.iCareRepository.save(record);

    this.triggerCommitFulfilledEmails(saved.id, saved).catch((err) =>
      this.logger.error(
        `❌ Failed to trigger 'commit_fulfilled' email for id=${saved.id}`,
        err?.message || err,
      ),
    );

    return this.transformDates([saved])[0];
  }

  // -- Coordinator Rejection --------------------------------------------------

  /**
   * El coordinator rechaza un iCare en estado pending.
   * Status → rejection_under_review. Se notifica a HR + Management.
   */
  async coordinatorReject(id: string, dto: CoordinatorRejectICareDto): Promise<ICare> {
    const record = await this.iCareRepository.findOne({ where: { id } });
    if (!record) throw new NotFoundException(`ICare record with id ${id} not found`);

    if (record.urgency === ICareUrgency.HIGH || record.urgency === ICareUrgency.CRITICAL || record.staff_name?.is_coordinator === true) {
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
   * accept=false -> override: HR/Mgmt asigna la urgency final (dto.urgency, requerida).
   *   - Low/Medium  -> status PENDING, vuelve al coordinator. rejection_override=true bloquea
   *                    que lo vuelva a rechazar o cambie la urgency (ver guard en justify());
   *                    el coordinator solo puede justificarlo para que avance a staff.
   *   - High/Critical -> status PENDING_HR_JUSTIFY, se queda con HR/Mgmt (el coordinator no
   *                    puede actuar sobre H/C). HR/Mgmt lo justifica luego con el mismo
   *                    endpoint /justify (urgency ya bloqueada) y avanza directo a IN_PROGRESS.
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
      // Override -> HR/Mgmt decide la urgency final; es obligatoria para saber a quién
      // regresa el caso (coordinator en L/M, HR/Mgmt mismos en H/C).
      if (!dto.urgency) {
        throw new BadRequestException('Urgency is required when overriding a rejection');
      }
      record.urgency = dto.urgency;
      record.rejection_override = true;

      if (dto.urgency === ICareUrgency.HIGH || dto.urgency === ICareUrgency.CRITICAL) {
        record.status = ICareStatus.PENDING_HR_JUSTIFY;
      } else {
        record.status = ICareStatus.PENDING;
      }
    }

    const saved = await this.iCareRepository.save(record);

    this.triggerRejectionReviewedEmails(saved.id, saved, dto.accept).catch((err) =>
      this.logger.error(
        `Failed to trigger 'rejection_reviewed' email for id=${saved.id}`,
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
    if (managementEmails.length > 0) sends.push(this.triggerEmail(id, 'creation_approved_management', managementEmails));
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
    if (managementEmails.length > 0) sends.push(this.triggerEmail(id, 'creation_rejected_management', managementEmails));
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

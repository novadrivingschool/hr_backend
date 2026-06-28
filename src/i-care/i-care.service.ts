import { BadRequestException, ForbiddenException, Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';
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
import { ApproveJustificationICareDto } from './dto/approve-justification-i-care.dto';
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
  | 'justification_downgraded_hr' | 'justification_downgraded_management';

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
   * Dispara los 4 emails de creación en paralelo:
   *   created_staff       → quien creó el registro
   *   created_coordinator → assigned coordinators (no submitter identity)
   *   created_hr          → role 'hr' (con identidad completa)
   *   created_management  → role 'management' (con identidad completa)
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

    if (staffEmail) {
      sends.push(this.triggerEmail(id, 'created_staff', [staffEmail]));
    }
    // Coordinator does NOT receive email for High/Critical or coordinator-as-staff cases
    if (coordinatorEmails.length > 0 && !isHighCritical && !isCoordinatorCase) {
      sends.push(this.triggerEmail(id, 'created_coordinator', coordinatorEmails));
    }
    if (allHrEmails.length > 0) {
      sends.push(this.triggerEmail(id, 'created_hr', allHrEmails));
    }
    if (managementEmails.length > 0) {
      sends.push(this.triggerEmail(id, 'created_management', managementEmails));
    }

    // Position-based emails: Operator / Instructor / Teacher (skip if High/Critical or coordinator-as-staff)
    if (!isHighCritical && !isCoordinatorCase && record.submitter?.employee_number) {
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

  private async triggerDowngradedEmails(id: string, record: ICare): Promise<void> {
    const staffEmail = record.staff_name?.nova_email;
    const responsibleEmails = (record.responsible ?? []).map((r: any) => r.nova_email).filter(Boolean);
    const [hrEmails, managementEmails, hrAssistantEmails] = await Promise.all([
      this.getEmailsByRole('hr'),
      this.getEmailsByRole('management'),
      this.getEmailsByAnyRole('hr-assistant'),
    ]);
    const allHrEmails = [...hrEmails, ...hrAssistantEmails];
    const sends: Promise<void>[] = [];
    if (staffEmail) sends.push(this.triggerEmail(id, 'justification_downgraded_staff', [staffEmail]));
    if (responsibleEmails.length > 0) sends.push(this.triggerEmail(id, 'justification_downgraded_coordinator', responsibleEmails));
    if (allHrEmails.length > 0) sends.push(this.triggerEmail(id, 'justification_downgraded_hr', allHrEmails));
    if (managementEmails.length > 0) sends.push(this.triggerEmail(id, 'justification_downgraded_management', managementEmails));
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
    if (record.staff_name?.employee_number) {
      const staffEmployee = await this.employeeRepository.findOne({
        where: { employee_number: record.staff_name.employee_number },
        select: ['roles'],
      });
      const staffRoles: string[] = (staffEmployee as any)?.roles ?? [];
      const isCoordinator = staffRoles.some(r =>
        r === 'coordinator' || r === 'coordinator-assistant' || r === 'super-coordinator',
      );
      if (isCoordinator) {
        record.staff_name = { ...record.staff_name, is_coordinator: true };
      }
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

    const now = moment().tz('America/Chicago');

    record.justified = dto.justified;
    record.justified_approved_by = dto.approved_by;
    record.justified_date = now.format('YYYY-MM-DD');
    record.justified_time = now.format('HH:mm');

    // Guardar la urgency seleccionada (coordinator L/M → in_progress; coordinator H/C → pending_hr_review; HR/Mgmt → in_progress)
    if (dto.urgency && dto.justified) record.urgency = dto.urgency;

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
    const isHighCriticalUrgency = dto.urgency === ICareUrgency.HIGH || dto.urgency === ICareUrgency.CRITICAL;

    if (dto.justified) {
      if (isCoordinatorRole && isHighCriticalUrgency) {
        record.status = ICareStatus.PENDING_HR_REVIEW;
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
      record.urgency = dto.urgency;
      record.status = ICareStatus.IN_PROGRESS;
      record.justified = true;
      record.justified_approved_by = dto.reviewed_by;
      record.justified_date = now.format('YYYY-MM-DD');
      record.justified_time = now.format('HH:mm');
      if (dto.notes) record.hr_justified_notes = dto.notes;
      if (dto.attachments?.length) record.hr_justified_attachments = [...(record.hr_justified_attachments ?? []), ...dto.attachments];
      const saved = await this.iCareRepository.save(record);
      const isHC = dto.urgency === ICareUrgency.HIGH || dto.urgency === ICareUrgency.CRITICAL;
      if (isHC) {
        this.triggerHcAcceptedEmails(saved.id, saved).catch((err) =>
          this.logger.error(`❌ Failed to trigger 'hc_accepted' emails for id=${saved.id}`, err?.message || err),
        );
      } else {
        this.triggerDowngradedEmails(saved.id, saved).catch((err) =>
          this.logger.error(`❌ Failed to trigger 'downgraded' emails for id=${saved.id}`, err?.message || err),
        );
      }
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
   * accept=false -> override: status va a IN_PROGRESS, rejection_override=true.
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
      // Override -> va directo a IN_PROGRESS, coordinator no puede rechazar de nuevo
      record.status = ICareStatus.IN_PROGRESS;
      record.rejection_override = true;
      // Marcar como justified para que el staff lo vea en MyICare y pueda hacer commit
      record.justified = true;
      record.justified_date = now.format('YYYY-MM-DD');
      record.justified_time = now.format('HH:mm');
      record.justified_approved_by = dto.reviewed_by;
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

import { Injectable, NotFoundException, InternalServerErrorException, BadRequestException, ConflictException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';
import * as moment from 'moment-timezone';
import axios from 'axios';
import { ActivityRequest } from './entities/activity_request.entity';
import { CreateActivityRequestDto } from './dto/create-activity_request.dto';
import { UpdateActivityRequestDto } from './dto/update-activity_request.dto';
import { StatusEnum } from './enums';
import { ActivityRequestSavedDto, RecipientDto } from './dto/activity-request-email.dto';
import { ActivityRequestApiClient } from './api/activity-request.api';
import { EmployeesService } from 'src/employees/employees.service';
import { pushBellNotification, resolveEmployeeNumbersByRoles } from 'src/common/it-api.client';

@Injectable()
export class ActivityRequestService {
  private readonly logger = new Logger(ActivityRequestService.name);
  private readonly apiClient: ActivityRequestApiClient;

  constructor(
    @InjectRepository(ActivityRequest)
    private readonly activityRequestRepo: Repository<ActivityRequest>,
    private readonly employeeService: EmployeesService,
  ) {
    this.apiClient = new ActivityRequestApiClient();
  }

  async create(createDto: CreateActivityRequestDto): Promise<ActivityRequest> {
    try {
      const chicagoNow = moment().tz('America/Chicago');
      const request = this.activityRequestRepo.create({
        ...createDto,
        status: StatusEnum.Pending,
        createdDate: chicagoNow.format('YYYY-MM-DD'),
        createdTime: chicagoNow.format('HH:mm:ss'),
        coordinator_approval: { approved: false, by: '', date: '', time: '' },
        hr_approval: { approved: false, by: '', date: '', time: '' },
      });

      const saved = await this.activityRequestRepo.save(request);

      this.sendCoordinatorNotification(saved).catch((emailErr) => {
        this.logger.warn(`[create] Coordinator email failed (non-blocking): ${emailErr?.message}`);
      });
      this.notifyAdminsOfNewRequest(saved).catch((bellErr) => {
        this.logger.warn(`[create] Bell notification failed (non-blocking): ${bellErr?.message}`);
      });

      return saved;
    } catch (error) {
      this.logger.error('Failed to create activity request', error.stack);
      throw new InternalServerErrorException('Error creating activity request');
    }
  }

  async findAll(): Promise<ActivityRequest[]> {
    try {
      return await this.activityRequestRepo.find({
        order: { createdDate: 'DESC', createdTime: 'DESC' },
      });
    } catch (error) {
      this.logger.error('Failed to fetch activity requests', error.stack);
      throw new InternalServerErrorException('Error fetching activity requests');
    }
  }

  async findOne(id: string): Promise<ActivityRequest> {
    const request = await this.activityRequestRepo.findOne({ where: { id } });
    if (!request) throw new NotFoundException(`Activity request ID ${id} not found`);
    return request;
  }

  async update(id: string, updateDto: UpdateActivityRequestDto): Promise<ActivityRequest> {
    const request = await this.findOne(id);

    if (request.status !== StatusEnum.Pending) {
      throw new BadRequestException(
        `Cannot edit a request with status "${request.status}". Only Pending requests can be edited.`,
      );
    }

    const { status: _strippedStatus, ...safeUpdateDto } = updateDto as any;
    const updated = Object.assign(request, safeUpdateDto);
    return await this.activityRequestRepo.save(updated);
  }

  async searchByEmployeeAndStatus(employeeNumber: string, status?: string): Promise<ActivityRequest[]> {
    try {
      const query = this.activityRequestRepo
        .createQueryBuilder('request')
        .where(`request.employee_data::jsonb ->> 'employee_number' = :employeeNumber`, { employeeNumber });

      if (status && status !== 'All') {
        query.andWhere('request.status = :status', { status });
      }

      return await query
        .orderBy('request.createdDate', 'DESC')
        .addOrderBy('request.createdTime', 'DESC')
        .getMany();
    } catch (error) {
      this.logger.error(`Failed to search requests for employee ${employeeNumber}`, error.stack);
      throw new InternalServerErrorException('Error searching activity requests');
    }
  }

  async findHrByStatusDepartmentAndEmployee(
    status: string,
    multi_department: string[] = [],
    employee_number?: string,
    search?: string,
    dateFrom?: string,
    dateTo?: string,
  ): Promise<ActivityRequest[]> {
    const query = this.activityRequestRepo.createQueryBuilder('request');

    const depts = multi_department.map(d => d.trim()).filter(Boolean);
    if (depts.length > 0) {
      query.andWhere(new Brackets(sqb => {
        depts.forEach((d, i) => {
          sqb.orWhere(`(request.employee_data -> 'multi_department') @> :dept${i}`, {
            [`dept${i}`]: JSON.stringify([d]),
          });
        });
      }));
    }

    if (employee_number) {
      query.andWhere(`request.employee_data ->> 'employee_number' = :employee_number`, { employee_number });
    }

    if (search) {
      query.andWhere(new Brackets(sqb => {
        sqb.orWhere(
          `(request.employee_data ->> 'name') || ' ' || (request.employee_data ->> 'last_name') ILIKE :search`,
          { search: `%${search}%` },
        );
        sqb.orWhere(`request.employee_data ->> 'employee_number' ILIKE :search`, { search: `%${search}%` });
      }));
    }

    if (dateFrom || dateTo) {
      const from = dateFrom ?? dateTo;
      const to = dateTo ?? dateFrom;
      query.andWhere(`request."requestedDate" >= :dateFrom AND request."requestedDate" <= :dateTo`, {
        dateFrom: from,
        dateTo: to,
      });
    }

    const s = status?.toLowerCase?.() ?? '';
    if (s === 'pending') {
      query
        .andWhere(`request.status = 'Pending'`)
        .andWhere(`request.hr_approval ->> 'approved' = 'false'`)
        .andWhere(`(request.coordinator_approval ->> 'approved' = 'true' OR request.coordinator_approval ->> 'approved' = 'false')`);
    } else if (s === 'approved') {
      query
        .andWhere(`request.hr_approval ->> 'approved' = 'true'`)
        .andWhere(`request.coordinator_approval ->> 'approved' = 'true'`);
    } else if (s === 'not approved') {
      query
        .andWhere(`request.status = 'Not Approved'`)
        .andWhere(`request.hr_approval ->> 'approved' = 'false'`);
    } else if (s === 'cancelled') {
      query.andWhere(`request.status = 'Cancelled'`);
    }

    return query
      .orderBy('request.createdDate', 'DESC')
      .addOrderBy('request.createdTime', 'DESC')
      .getMany();
  }

  async getKpiCounts(multi_department: string[] = []): Promise<{
    pendingCoordinator: number;
    pendingHR: number;
    approved: number;
    notApproved: number;
    cancelled: number;
    total: number;
  }> {
    const base = this.activityRequestRepo.createQueryBuilder('request');

    const applyDeptFilter = (qb: typeof base) => {
      const depts = multi_department.map(d => d.trim()).filter(Boolean);
      if (depts.length > 0) {
        qb.andWhere(new Brackets(sqb => {
          depts.forEach((d, i) => {
            sqb.orWhere(`(request.employee_data -> 'multi_department') @> :dept${i}`, {
              [`dept${i}`]: JSON.stringify([d]),
            });
          });
        }));
      }
      return qb;
    };

    const pendingCoordinator = await applyDeptFilter(
      this.activityRequestRepo.createQueryBuilder('request')
        .andWhere(`request.status = 'Pending'`)
        .andWhere(`request.coordinator_approval ->> 'approved' = 'false'`)
    ).getCount();

    const pendingHR = await applyDeptFilter(
      this.activityRequestRepo.createQueryBuilder('request')
        .andWhere(`request.status = 'Pending'`)
        .andWhere(`request.coordinator_approval ->> 'approved' = 'true'`)
        .andWhere(`request.hr_approval ->> 'approved' = 'false'`)
    ).getCount();

    const approved = await applyDeptFilter(
      this.activityRequestRepo.createQueryBuilder('request').andWhere(`request.status = 'Approved'`)
    ).getCount();

    const notApproved = await applyDeptFilter(
      this.activityRequestRepo.createQueryBuilder('request').andWhere(`request.status = 'Not Approved'`)
    ).getCount();

    const cancelled = await applyDeptFilter(
      this.activityRequestRepo.createQueryBuilder('request').andWhere(`request.status = 'Cancelled'`)
    ).getCount();

    const total = pendingCoordinator + pendingHR + approved + notApproved + cancelled;
    return { pendingCoordinator, pendingHR, approved, notApproved, cancelled, total };
  }

  async approveByCoordinator(
    id: string,
    approved: boolean,
    by: string,
    coordinator_comments: string,
  ): Promise<{ message: string; data: ActivityRequest }> {
    try {
      const request = await this.findOne(id);
      const chicagoNow = moment().tz('America/Chicago');

      request.coordinator_approval = {
        approved,
        by,
        date: chicagoNow.format('YYYY-MM-DD'),
        time: chicagoNow.format('HH:mm:ss'),
      };
      request.coordinator_comments = coordinator_comments;

      if (!approved) {
        request.hr_approval = {
          approved: false,
          by,
          date: chicagoNow.format('YYYY-MM-DD'),
          time: chicagoNow.format('HH:mm:ss'),
        };
        request.hr_comments = `Not approved by Coordinator: ${by}`;
        request.status = StatusEnum.NotApproved;
      }

      const updatedRequest = await this.activityRequestRepo.save(request);

      if (approved) {
        try {
          await this.sendHrEmail(updatedRequest);
        } catch (err) {
          this.logger.warn(`[approveByCoordinator] HR email failed (non-blocking): ${err?.message}`);
        }
      }

      if (approved) {
        try {
          await this.notifyRolesOfStageDecision(updatedRequest, ['hr', 'management'], 'coordinator', true);
        } catch (err) {
          this.logger.warn(`[approveByCoordinator] HR/Management bell notification failed (non-blocking): ${err?.message}`);
        }
      }

      try {
        await this.apiClient.sendStaffTemplate({
          templateName: 'activity_request_staff_notification',
          recipients: updatedRequest.employee_data?.nova_email ? [updatedRequest.employee_data.nova_email] : [],
          formData: { ...updatedRequest },
          actor: 'Coordinator',
        });
      } catch (err) {
        this.logger.warn(`[approveByCoordinator] Staff notification failed (non-blocking): ${err?.message}`);
      }

      try {
        await this.notifyEmployeeOfDecision(updatedRequest, 'coordinator', approved);
      } catch (err) {
        this.logger.warn(`[approveByCoordinator] Employee bell notification failed (non-blocking): ${err?.message}`);
      }

      return {
        message: `Activity request ${approved ? 'approved (Stage 1 — awaiting HR)' : 'rejected'} by ${by}`,
        data: updatedRequest,
      };
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      throw new InternalServerErrorException('An error occurred while approving the request by coordinator');
    }
  }

  async approveByHR(
    id: string,
    approved: boolean,
    by: string,
    hr_comments: string,
  ): Promise<ActivityRequest> {
    try {
      const request = await this.findOne(id);

      if (request.status === StatusEnum.Approved || request.status === StatusEnum.NotApproved) {
        throw new ConflictException(
          `Activity request ${id} was already resolved by HR (status: ${request.status}).`,
        );
      }

      const chicagoNow = moment().tz('America/Chicago');

      if (!request.coordinator_approval?.approved) {
        request.coordinator_approval = {
          approved,
          by,
          date: chicagoNow.format('YYYY-MM-DD'),
          time: chicagoNow.format('HH:mm:ss'),
        };
        request.coordinator_comments = hr_comments;
      }

      request.hr_approval = {
        approved,
        by,
        date: chicagoNow.format('YYYY-MM-DD'),
        time: chicagoNow.format('HH:mm:ss'),
      };
      request.hr_comments = hr_comments;
      request.status = approved ? StatusEnum.Approved : StatusEnum.NotApproved;

      const updatedRequest = await this.activityRequestRepo.save(request);

      try {
        const recipients = await this.resolveAdminAndSupervisorRecipients(
          updatedRequest.employee_data?.employee_number,
          'approveByHR',
          ['management'],
        );
        await this.notifyStageDecisionRecipients(updatedRequest, recipients, 'hr', approved);
      } catch (err) {
        this.logger.warn(`[approveByHR] Management/supervisor bell notification failed (non-blocking): ${err?.message}`);
      }

      try {
        await this.apiClient.sendStaffTemplate({
          templateName: 'activity_request_staff_notification',
          recipients: updatedRequest.employee_data?.nova_email ? [updatedRequest.employee_data.nova_email] : [],
          formData: { ...updatedRequest },
          actor: 'HR',
        });
      } catch (err) {
        this.logger.warn(`[approveByHR] Staff notification failed (non-blocking): ${err?.message}`);
      }

      try {
        await this.notifyEmployeeOfDecision(updatedRequest, 'hr', approved);
      } catch (err) {
        this.logger.warn(`[approveByHR] Employee bell notification failed (non-blocking): ${err?.message}`);
      }

      return updatedRequest;
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof ConflictException) throw error;
      this.logger.error(`HR approval failed for request ID ${id}`, error.stack);
      throw new InternalServerErrorException('Error approving by HR');
    }
  }

  async cancelRequest(
    id: string,
    cancelled_by: string,
    role: 'staff' | 'hr' | 'coordinator' | 'management',
    reason?: string,
  ): Promise<{ message: string; data: ActivityRequest }> {
    try {
      const request = await this.findOne(id);

      const cancellableStatuses: StatusEnum[] = [StatusEnum.Pending, StatusEnum.Approved];
      if (!cancellableStatuses.includes(request.status)) {
        throw new BadRequestException(
          `Cannot cancel a request with status "${request.status}". Only Pending or Approved requests can be cancelled.`,
        );
      }

      const chicagoNow = moment().tz('America/Chicago');

      request.status = StatusEnum.Cancelled;
      request.cancellation_info = {
        cancelled_by,
        role,
        reason: reason ?? '',
        date: chicagoNow.format('YYYY-MM-DD'),
        time: chicagoNow.format('HH:mm:ss'),
      };

      const updated = await this.activityRequestRepo.save(request);

      try {
        await this.apiClient.sendStaffTemplate({
          templateName: 'activity_request_staff_notification',
          recipients: updated.employee_data?.nova_email ? [updated.employee_data.nova_email] : [],
          formData: { ...updated },
          actor: role === 'hr' ? 'HR' : role === 'management' ? 'Management' : role === 'coordinator' ? 'Coordinator' : 'System',
        });
      } catch (err) {
        this.logger.warn(`[cancelRequest] Cancel notification failed for request ${id}: ${err?.message}`);
      }

      const cancelActor = cancelled_by || role || 'System';
      this.notifyAdminsOfLifecycleEvent(updated, 'cancelled', cancelActor).catch((err) => {
        this.logger.warn(`[cancelRequest] Admin bell notification failed (non-blocking): ${err?.message}`);
      });
      if (['hr', 'management', 'coordinator'].includes((role || '').toLowerCase())) {
        this.notifyEmployeeOfCancellation(updated, cancelActor).catch((err) => {
          this.logger.warn(`[cancelRequest] Employee bell notification failed (non-blocking): ${err?.message}`);
        });
      }

      return {
        message: `Activity request cancelled by ${cancelled_by} (${role})`,
        data: updated,
      };
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof BadRequestException) throw error;
      this.logger.error(`[cancelRequest] Failed for request ID ${id}`, error.stack);
      throw new InternalServerErrorException('Error cancelling activity request');
    }
  }

  async reopenRequest(id: string, reopened_by: string): Promise<{ message: string; data: ActivityRequest }> {
    const request = await this.findOne(id);

    const reopenableStatuses: StatusEnum[] = [StatusEnum.NotApproved, StatusEnum.Cancelled];
    if (!reopenableStatuses.includes(request.status)) {
      throw new BadRequestException(
        `Cannot reopen a request with status "${request.status}". Only Not Approved or Cancelled requests can be reopened.`,
      );
    }

    request.status = StatusEnum.Pending;
    request.coordinator_approval = { approved: false, by: '', date: '', time: '' };
    request.hr_approval = { approved: false, by: '', date: '', time: '' };
    request.coordinator_comments = '';
    request.hr_comments = '';
    request.cancellation_info = null;

    const updated = await this.activityRequestRepo.save(request);

    try {
      await this.sendCoordinatorNotification(updated);
    } catch (err) {
      this.logger.warn(`Reopen coordinator notification failed for request ${id}: ${err?.message}`);
    }

    this.notifyAdminsOfLifecycleEvent(updated, 'reopened', reopened_by || 'System').catch((err) => {
      this.logger.warn(`[reopenRequest] Bell notification failed (non-blocking): ${err?.message}`);
    });

    return { message: `Activity request reopened by ${reopened_by}`, data: updated };
  }

  async resendStaffEmail(id: string): Promise<{ message: string }> {
    try {
      const request = await this.findOne(id);
      await this.apiClient.sendStaffTemplate({
        templateName: 'activity_request_staff_notification',
        recipients: request.employee_data?.nova_email ? [request.employee_data.nova_email] : [],
        formData: { ...request } as any,
        actor: 'System',
      });
      return { message: `Staff email resent for activity request ${id}` };
    } catch (error) {
      this.logger.error(`[resendStaffEmail] Failed for request ${id}`, error.stack);
      throw new InternalServerErrorException('Error resending staff email');
    }
  }

  // ── Email helpers ──────────────────────────────────────────────────────

  private async sendCoordinatorNotification(payload: ActivityRequestSavedDto) {
    const coordinatorEmails = await this.employeeService.getSupervisorsEmailsByEmployeeNumber(
      payload.employee_data.employee_number,
    );

    if (coordinatorEmails.length === 0) {
      this.logger.warn(`⚠️ No supervisors found for employee ${payload.employee_data.employee_number}`);
      return;
    }

    const dto = {
      recipients: coordinatorEmails,
      templateName: '',
      formData: payload,
      subject: ``,
    };

    try {
      dto.templateName = 'staff_submitted_activity_request';
      await this.apiClient.sendStaffSubmittedTemplate(dto);

      dto.templateName = 'coordinator_activity_request';
      return await this.apiClient.sendCoordinatorTemplate(dto);
    } catch (err) {
      this.logger.error(`❌ Error sending coordinator template: ${err.message}`);
      throw err;
    }
  }

  async sendHrEmail(updatedRequest: ActivityRequestSavedDto) {
    const recipientsObjects: RecipientDto[] = await this.resolveRecipientsByRole('hr');

    if (recipientsObjects.length === 0) {
      this.logger.warn('⚠️ No HR recipients found for role: hr');
      return { success: true, templateName: 'hr_activity_request', subject: '', total: 0 };
    }

    const dto = {
      recipientsObjects,
      templateName: 'hr_activity_request',
      subject: ``,
      formData: updatedRequest,
    };

    return this.apiClient.sendHRTemplate(dto);
  }

  // ── Bell helpers (idénticos en forma a TimeOffRequestService) ──────────

  private async resolveAdminAndSupervisorRecipients(
    requesterEmployeeNumber: string | undefined,
    context: string,
    roles: string[] = ['hr', 'management'],
  ): Promise<string[]> {
    const [roleRecipients, supervisorNumbers] = await Promise.all([
      resolveEmployeeNumbersByRoles(roles),
      requesterEmployeeNumber
        ? this.employeeService
            .getSupervisorEmployeeNumbersByEmployeeNumber(requesterEmployeeNumber)
            .catch((err) => {
              this.logger.warn(`[${context}] could not resolve supervisors: ${err?.message}`);
              return [] as string[];
            })
        : Promise.resolve([] as string[]),
    ]);

    return [...new Set([...roleRecipients, ...supervisorNumbers])];
  }

  private async notifyAdminsOfNewRequest(saved: ActivityRequest): Promise<void> {
    const recipients = await this.resolveAdminAndSupervisorRecipients(
      saved.employee_data?.employee_number,
      'notifyAdminsOfNewRequest',
    );

    if (recipients.length === 0) {
      this.logger.warn('[notifyAdminsOfNewRequest] no hr/management employee and no supervisor resolved — skipping bell notification.');
      return;
    }

    const requester = `${saved.employee_data?.name ?? ''} ${saved.employee_data?.last_name ?? ''}`.trim()
      || saved.employee_data?.employee_number
      || 'An employee';

    await pushBellNotification({
      category: 'activity_request',
      type: 'created',
      title: 'New Activity Request',
      message: `${requester} requested a ${saved.punchType} correction for ${saved.requestedDate}`,
      link: `/activity-request-admin?request=${saved.id}`,
      source_id: saved.id,
      recipients,
    });
  }

  private async notifyAdminsOfLifecycleEvent(
    updated: ActivityRequest,
    event: 'cancelled' | 'reopened',
    actor: string,
  ): Promise<void> {
    const recipients = await this.resolveAdminAndSupervisorRecipients(
      updated.employee_data?.employee_number,
      `notifyAdminsOfLifecycleEvent:${event}`,
    );
    if (recipients.length === 0) return;

    const requester = `${updated.employee_data?.name ?? ''} ${updated.employee_data?.last_name ?? ''}`.trim()
      || updated.employee_data?.employee_number
      || 'An employee';

    await pushBellNotification({
      category: 'activity_request',
      type: event,
      title: event === 'cancelled' ? 'Activity Request Cancelled' : 'Activity Request Reopened',
      message: event === 'cancelled'
        ? `${requester}'s ${updated.punchType} correction request (${updated.requestedDate}) was cancelled by ${actor}.`
        : `${requester}'s ${updated.punchType} correction request (${updated.requestedDate}) was reopened by ${actor} and is pending approval again.`,
      link: `/activity-request-admin?request=${updated.id}`,
      source_id: updated.id,
      recipients,
    });
  }

  private async notifyEmployeeOfCancellation(updated: ActivityRequest, actor: string): Promise<void> {
    const employeeNumber = updated.employee_data?.employee_number;
    if (!employeeNumber) return;

    await pushBellNotification({
      category: 'activity_request',
      type: 'cancelled',
      title: 'Activity Request Cancelled',
      message: `Your ${updated.punchType} correction request (${updated.requestedDate}) was cancelled by ${actor}.`,
      link: `/activity-request?request=${updated.id}`,
      source_id: updated.id,
      recipients: [employeeNumber],
    });
  }

  private async notifyRolesOfStageDecision(
    updated: ActivityRequest,
    roles: string[],
    stage: 'coordinator' | 'hr',
    approved: boolean,
  ): Promise<void> {
    const recipients = await resolveEmployeeNumbersByRoles(roles);
    await this.notifyStageDecisionRecipients(updated, recipients, stage, approved);
  }

  private async notifyStageDecisionRecipients(
    updated: ActivityRequest,
    recipients: string[],
    stage: 'coordinator' | 'hr',
    approved: boolean,
  ): Promise<void> {
    if (recipients.length === 0) return;

    const requester = `${updated.employee_data?.name ?? ''} ${updated.employee_data?.last_name ?? ''}`.trim()
      || updated.employee_data?.employee_number
      || 'An employee';

    const actorName = (stage === 'coordinator' ? updated.coordinator_approval?.by : updated.hr_approval?.by)
      || (stage === 'coordinator' ? 'the coordinator' : 'HR/Management');

    let title: string;
    let message: string;

    if (stage === 'coordinator') {
      title = 'Activity Request Awaiting HR Approval';
      message = `${requester}'s ${updated.punchType} correction request (${updated.requestedDate}) was approved by ${actorName} and now needs HR/Management approval.`;
    } else {
      title = approved ? 'Activity Request Approved' : 'Activity Request Not Approved';
      message = `${requester}'s ${updated.punchType} correction request (${updated.requestedDate}) was ${approved ? 'approved' : 'not approved'} by ${actorName}.`;
    }

    await pushBellNotification({
      category: 'activity_request',
      type: `${stage}_${approved ? 'approved' : 'rejected'}_notice`,
      title,
      message,
      link: `/activity-request-admin?request=${updated.id}`,
      source_id: updated.id,
      recipients,
    });
  }

  private async notifyEmployeeOfDecision(
    updated: ActivityRequest,
    stage: 'coordinator' | 'hr',
    approved: boolean,
  ): Promise<void> {
    const employeeNumber = updated.employee_data?.employee_number;
    if (!employeeNumber) return;

    const actorName = (stage === 'coordinator' ? updated.coordinator_approval?.by : updated.hr_approval?.by)
      || (stage === 'coordinator' ? 'your coordinator' : 'HR/Management');

    let title: string;
    let message: string;

    if (stage === 'coordinator') {
      title = approved ? 'Activity Request Approved by Coordinator' : 'Activity Request Not Approved';
      message = approved
        ? `Your ${updated.punchType} correction request (${updated.requestedDate}) was approved by ${actorName}. Awaiting final approval from HR.`
        : `Your ${updated.punchType} correction request (${updated.requestedDate}) was not approved by ${actorName}.`;
    } else {
      title = approved ? 'Activity Request Approved' : 'Activity Request Not Approved';
      message = approved
        ? `Your ${updated.punchType} correction request (${updated.requestedDate}) has been fully approved by ${actorName}.`
        : `Your ${updated.punchType} correction request (${updated.requestedDate}) was not approved by ${actorName}.`;
    }

    await pushBellNotification({
      category: 'activity_request',
      type: `${stage}_${approved ? 'approved' : 'rejected'}`,
      title,
      message,
      link: `/activity-request?request=${updated.id}`,
      source_id: employeeNumber ? updated.id : updated.id,
      recipients: [employeeNumber],
    });
  }

  /**
   * Resuelve destinatarios por rol contra nova-one-backend, vía el mismo
   * endpoint `/employees/filter` que ya usa el bell (resolveEmployeeNumbersByRoles
   * en src/common/it-api.client.ts) — la diferencia es que acá se necesita el
   * objeto completo (name/last_name/nova_email) para poder mandar el email,
   * no solo el employee_number.
   *
   * Reemplaza el viejo esquema de permisos booleanos manuales por-empleado
   * (`hr_activity_request_template`/`management_activity_request_template`):
   * ahora quien tenga el rol 'hr' asignado en Nova One recibe el email
   * automáticamente, sin que un admin tenga que prenderlo a mano por persona.
   */
  private async resolveRecipientsByRole(role: string): Promise<RecipientDto[]> {
    let baseUrl = (process.env.NOVA_ONE_API ?? '').trim();
    if (!baseUrl) {
      this.logger.error('[resolveRecipientsByRole] NOVA_ONE_API no está configurado.');
      return [];
    }
    baseUrl = baseUrl.replace(/\/$/, '');

    const PER_PAGE = 100;
    const MAX_PAGES = 10;
    const recipients: RecipientDto[] = [];

    try {
      for (let page = 1; page <= MAX_PAGES; page++) {
        const resp = await axios.post(
          `${baseUrl}/employees/filter?page=${page}&per_page=${PER_PAGE}`,
          { status: 'Active', permissions: role },
          { timeout: 7000 },
        );
        const rows: any[] = resp.data?.data ?? [];
        for (const e of rows) {
          if (e?.nova_email) {
            recipients.push({
              employee_number: e.employee_number,
              name: e.name,
              last_name: e.last_name,
              nova_email: e.nova_email,
            });
          }
        }
        if (rows.length < PER_PAGE) break;
      }
    } catch (e: any) {
      this.logger.error(`[resolveRecipientsByRole] error resolving role=${role}: ${e?.message}`);
      return [];
    }

    return recipients;
  }
}

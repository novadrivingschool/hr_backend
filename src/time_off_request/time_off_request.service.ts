import { Injectable, NotFoundException, InternalServerErrorException, Logger, BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';
import { TimeOffRequest } from './entities/time_off_request.entity';
import { CreateTimeOffRequestDto } from './dto/create-time_off_request.dto';
import { UpdateTimeOffRequestDto } from './dto/update-time_off_request.dto';
import * as moment from 'moment-timezone';
import { CreateTimeOffRequestSavedDto, RecipientDto, SendTimeOffTemplateDto, SendTimeOffTemplateObjDto } from './dto/time-off.dto';
import axios from 'axios';
import { StatusEnum, TimeTypeEnum } from './enums';
import { EmployeesService } from 'src/employees/employees.service';
import { TimeOffApiClient } from './api/time-off.api';
import { EmployeeScheduleService } from 'src/employee_schedule/employee_schedule.service';
import { ScheduleEvent } from 'src/schedule_event/entities/schedule_event.entity';
import { EmployeeSchedule } from 'src/employee_schedule/entities/employee_schedule.entity';
import { RegisterEnum } from 'src/schedule_event/entities/register.enum';

interface EmployeeNumbersByPermissionResponse {
  permission: string;
  count: number;
  employee_numbers: string[];
}


@Injectable()
export class TimeOffRequestService {
  private readonly logger = new Logger(TimeOffRequestService.name);
  private readonly apiClient: TimeOffApiClient;

  constructor(
    @InjectRepository(TimeOffRequest)
    private readonly timeOffRequestRepo: Repository<TimeOffRequest>,
    @InjectRepository(ScheduleEvent)
    private readonly scheduleEventRepo: Repository<ScheduleEvent>,
    @InjectRepository(EmployeeSchedule)
    private readonly employeeScheduleRepo: Repository<EmployeeSchedule>,
    private readonly employeeService: EmployeesService,
    private readonly employeeScheduleService: EmployeeScheduleService,
  ) {
    this.apiClient = new TimeOffApiClient();
  }

  /* CREATE NEW TOR */
  async create(createDto: CreateTimeOffRequestDto): Promise<TimeOffRequest> {
    try {
      console.log("createDto: ", createDto);
      const chicagoNow = moment().tz('America/Chicago');
      const request = this.timeOffRequestRepo.create({
        ...createDto,
        status: StatusEnum.Pending,
        createdDate: chicagoNow.format('YYYY-MM-DD'),
        createdTime: chicagoNow.format('HH:mm:ss'),
        coordinator_approval: { approved: false, by: '' },
        hr_approval: { approved: false, by: '' },
      });

      const saved = await this.timeOffRequestRepo.save(request);
      console.log("saved: ", saved);

      // ── Coordinator email — non-blocking ──────────────────────────────────
      try {
        await this.sentCoordinatorRequest(saved);
      } catch (emailErr) {
        this.logger.warn(`[create] Coordinator email failed (non-blocking): ${emailErr?.message}`);
      }

      return saved;

    } catch (error) {
      this.logger.error('Failed to create time off request', error.stack);
      throw new InternalServerErrorException('Error creating time off request');
    }
  }


  async findAll(): Promise<TimeOffRequest[]> {
    try {
      return await this.timeOffRequestRepo.find({
        order: {
          createdDate: 'DESC',
          createdTime: 'DESC',
        },
      });
    } catch (error) {
      this.logger.error('Failed to fetch time off requests', error.stack);
      throw new InternalServerErrorException('Error fetching time off requests');
    }
  }

  async findOne(id: string): Promise<TimeOffRequest> {
    try {
      const request = await this.timeOffRequestRepo.findOne({ where: { id } });
      if (!request) throw new NotFoundException(`Request ID ${id} not found`);
      return request;
    } catch (error) {
      this.logger.error(`Failed to fetch time off request with ID ${id}`, error.stack);
      throw error;
    }
  }

  async update(id: string, updateDto: UpdateTimeOffRequestDto): Promise<TimeOffRequest> {
    try {
      // ── 1. Obtener el request actual ──────────────────────────────────────
      const request = await this.findOne(id);

      if (!request) {
        throw new NotFoundException(`Time-off request with ID ${id} not found`);
      }

      // ── 2. Solo se puede editar si está Pending ───────────────────────────
      if (request.status !== StatusEnum.Pending) {
        throw new BadRequestException(
          `Cannot edit a request with status "${request.status}". Only Pending requests can be edited.`,
        );
      }

      // ── 3. Detectar si cambiaron campos que afectan al schedule ───────────
      const scheduleFields: Array<keyof UpdateTimeOffRequestDto> = [
        'timeType', 'hourDate', 'startTime', 'endTime', 'startDate', 'endDate',
      ];

      const scheduleChanged = scheduleFields.some(field => {
        if (updateDto[field] === undefined) return false;
        return String(updateDto[field]) !== String((request as any)[field] ?? '');
      });

      // ── 4. Guardar cambios ────────────────────────────────────────────────
      const updated = Object.assign(request, updateDto);
      const saved = await this.timeOffRequestRepo.save(updated);

      // ── 5. Verificar si existen eventos para este TOR en el schedule ──────
      //    Solo tiene sentido si hubo cambios en campos de schedule
      if (scheduleChanged) {
        try {
          // Buscar el schedule del empleado
          const schedule = await this.employeeScheduleRepo.findOne({
            where: { employee_number: saved.employee_data?.employee_number },
          });

          if (schedule) {
            // Contar eventos vinculados a este TOR
            const existingEventsCount = await this.scheduleEventRepo
              .createQueryBuilder('event')
              .where('"scheduleId" = :scheduleId', { scheduleId: schedule.id })
              .andWhere('event.uuid_tor = :uuid_tor', { uuid_tor: id })
              .getCount();

            this.logger.log(
              `[update] TOR ${id} → found ${existingEventsCount} existing event(s) in schedule`,
            );

            if (existingEventsCount > 0) {
              // Existen eventos → borrar y recrear con los nuevos valores
              this.logger.log(`[update] Deleting and recreating ${existingEventsCount} event(s)`);
              await this._deleteScheduleEventsFromTimeOff(saved);
              await this._createScheduleEventsFromTimeOff(saved);
            } else {
              // No existen eventos → no hay nada que tocar
              // (TOR Pending aún no aprobado, o el create original falló y se ignoró)
              this.logger.log(`[update] No existing events for TOR ${id} — skipping schedule sync`);
            }
          } else {
            this.logger.warn(
              `[update] No schedule found for employee ${saved.employee_data?.employee_number} — skipping schedule sync`,
            );
          }
        } catch (syncErr) {
          // Non-blocking: el TOR ya fue guardado correctamente
          this.logger.warn(`[update] Schedule sync failed (non-blocking): ${syncErr?.message}`);
        }
      }

      return saved;

    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }

      this.logger.error(`[update] Failed to update request ID ${id}`, error.stack);
      throw new InternalServerErrorException('Error updating time off request');
    }
  }

  async remove(id: string): Promise<void> {
    try {
      const request = await this.findOne(id);
      await this.timeOffRequestRepo.remove(request);
    } catch (error) {
      this.logger.error(`Failed to remove request ID ${id}`, error.stack);
      throw new InternalServerErrorException('Error removing time off request');
    }
  }

  async searchByEmployeeAndStatus(employeeNumber: string, status?: string): Promise<TimeOffRequest[]> {
    try {
      const query = this.timeOffRequestRepo
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
      throw new InternalServerErrorException('Error searching time off requests');
    }
  }

  async searchCoordinatorByEmployeeAndStatus(employeeNumber: string, status?: string): Promise<TimeOffRequest[]> {
    try {
      const query = this.timeOffRequestRepo
        .createQueryBuilder('request')
        .where(`request.employee_data::jsonb ->> 'employee_number' = :employeeNumber`, { employeeNumber });

      // Lógica por status
      if (status === 'Pending') {
        query.andWhere(`request.status = 'Pending'`)
          .andWhere(`request.coordinator_approval ->> 'approved' = 'false'`);
      } else if (status === 'Approved') {
        query.andWhere(`request.status = 'Pending'`)
          .andWhere(`request.coordinator_approval ->> 'approved' = 'true'`);
      } else if (status === 'Not Approved') {
        query.andWhere(`request.status = 'Not Approved'`)
          .andWhere(`request.coordinator_approval ->> 'approved' = 'false'`);
      }
      // status === 'All' => no agregar nada

      return await query
        .orderBy('request.createdDate', 'DESC')
        .addOrderBy('request.createdTime', 'DESC')
        .getMany();
    } catch (error) {
      throw new InternalServerErrorException('Error searching time off requests');
    }
  }


  async updateStatus(id: string, status: StatusEnum): Promise<TimeOffRequest> {
    try {
      const request = await this.findOne(id);
      request.status = status;
      return await this.timeOffRequestRepo.save(request);
    } catch (error) {
      this.logger.error(`Failed to update status for request ID ${id}`, error.stack);
      throw new InternalServerErrorException('Error updating status');
    }
  }

  async approveByCoordinator(
    id: string,
    approved: boolean,
    by: string,
    coordinator_comments: string,
  ): Promise<{ message: string; data: TimeOffRequest }> {
    try {
      console.log('---------------------------------');
      console.log('Approving by COORDINATOR');
      console.log('id:', id);
      console.log('approved:', approved);
      console.log('coordinator_comments:', coordinator_comments);
      console.log('---------------------------------');

      const request = await this.findOne(id);
      if (!request) throw new NotFoundException(`Time-off request with ID ${id} not found`);

      const chicagoNow = moment().tz('America/Chicago');

      // ── Stage 1 ────────────────────────────────────────────────────
      request.coordinator_approval = {
        approved,
        by,
        date: chicagoNow.format('YYYY-MM-DD'),
        time: chicagoNow.format('HH:mm:ss'),
      };
      request.coordinator_comments = coordinator_comments;

      if (approved) {
        // ✅ Coordinator aprueba Stage 1 → TOR sigue Pending, espera HR (Stage 2)
        // hr_approval NO se toca — sigue { approved: false, by: '' }
      } else {
        // ❌ Coordinator rechaza → cierra AMBOS stages → TOR = Not Approved
        request.hr_approval = {
          approved: false,
          by,
          date: chicagoNow.format('YYYY-MM-DD'),
          time: chicagoNow.format('HH:mm:ss'),
        };
        request.hr_comments = `Not approved by Coordinator: ${by}`;
        request.status = StatusEnum.NotApproved;
      }

      const updatedRequest = await this.timeOffRequestRepo.save(request);
      console.log('updatedRequest:', updatedRequest);

      // ── Notificaciones ─────────────────────────────────────────────
      // Si aprobó Stage 1 → avisa a HR para que pasen al Stage 2
      if (approved) {
        try {
          await this.sendHrEmail(updatedRequest);
        } catch (err) {
          this.logger.warn(`[approveByCoordinator] HR email failed (non-blocking): ${err?.message}`);
        }
      }

      // Siempre avisa a Management (jerarquía mayor)
      try {
        await this.sendManagementEmail(updatedRequest);
      } catch (err) {
        this.logger.warn(`[approveByCoordinator] Management email failed (non-blocking): ${err?.message}`);
      }

      // Siempre avisa al Staff
      try {
        await this.apiClient.sendStaffTemplate({
          templateName: 'time_off_staff_notification',
          formData: { ...updatedRequest },
          actor: 'Coordinator',
        });
      } catch (err) {
        this.logger.warn(`[approveByCoordinator] Staff notification failed (non-blocking): ${err?.message}`);
      }

      return {
        message: `Time-off request ${approved ? 'approved (Stage 1 — awaiting HR)' : 'rejected'} by ${by}`,
        data: updatedRequest,
      };

    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      throw new InternalServerErrorException('An error occurred while approving the request by coordinator');
    }
  }

  /* SEND EMAIL TO HR TIME OFF REQUEST */
  async sendHrEmail(updatedRequest: CreateTimeOffRequestSavedDto) {
    const recipientsObjects: RecipientDto[] = await this.getEmployeeNumbersByPermission('hr_time_off_template');
    console.log("recipientsObjects: ", recipientsObjects);

    if (recipientsObjects.length === 0) {
      console.warn('⚠️ No HR recipientsObjects found for permission: hr_time_off_template');
      return { success: true, templateName: 'timeoff_hr_template', subject: '', total: 0 };
    }

    // 2) Arma el DTO que espera el Email Service
    const subject = ``;

    const dto: SendTimeOffTemplateObjDto = {
      recipientsObjects,                         // <-- string[]
      templateName: 'hr_time_off_request',
      subject,
      formData: updatedRequest
    };

    // 3) Envía usando el API client
    try {
      // Asegúrate de tener this.apiClient instanciado (por constructor o DI)
      const resp = await this.apiClient.sendHRTemplate(dto);
      console.log('✅ HR email service response:', resp);
      return resp;
    } catch (err: any) {
      console.error('❌ Error sending HR template:', err?.message ?? err);
      throw err;
    }

  }

  async approveByHR(
    id: string,
    approved: boolean,
    by: string,
    hr_comments: string,
  ): Promise<TimeOffRequest> {
    try {

      const request = await this.findOne(id);
      const chicagoNow = moment().tz('America/Chicago');

      // ✅ Solo sobreescribe Stage 1 si AÚN NO fue aprobado por coordinator
      // Si coordinator ya actuó → respeta su historial (nombre, fecha, comentarios)
      if (!request.coordinator_approval?.approved) {
        request.coordinator_approval = {
          approved,
          by,
          date: chicagoNow.format('YYYY-MM-DD'),
          time: chicagoNow.format('HH:mm:ss'),
        };
        request.coordinator_comments = hr_comments;
      }

      // ✅ Siempre setea Stage 2 (HR/Management/SuperCoordinator)
      request.hr_approval = {
        approved,
        by,
        date: chicagoNow.format('YYYY-MM-DD'),
        time: chicagoNow.format('HH:mm:ss'),
      };
      request.hr_comments = hr_comments;

      request.status = approved ? StatusEnum.Approved : StatusEnum.NotApproved;

      const updatedRequest = await this.timeOffRequestRepo.save(request);

      // ✅ Si fue aprobado → crear eventos en el schedule
      if (approved) {
        await this._createScheduleEventsFromTimeOff(updatedRequest);
      }

      console.log("<<<<<<<<<<<<<<<<<<<<")
      console.log(JSON.stringify(updatedRequest, null, 2))

      // Siempre avisa a Management
      try {
        await this.sendManagementEmail(updatedRequest);
      } catch (err) {
        this.logger.warn(`[approveByHR] Management email failed (non-blocking): ${err?.message}`);
      }

      // Siempre avisa al Staff
      try {
        await this.apiClient.sendStaffTemplate({
          templateName: 'time_off_staff_notification',
          formData: { ...updatedRequest },
          actor: 'HR',
        });
      } catch (err) {
        this.logger.warn(`[approveByHR] Staff notification failed (non-blocking): ${err?.message}`);
      }

      return updatedRequest;

    } catch (error) {
      this.logger.error(`HR approval failed for request ID ${id}`, error.stack);
      throw new InternalServerErrorException('Error approving by HR');
    }
  }

  /* SEND EMAIL TO MANAGEMENT TIME OFF REQUEST */
  async sendManagementEmail(updatedRequest: CreateTimeOffRequestSavedDto) {
    console.log("---------------- sendManagementEmail ----------------");
    const recipientsObjects: RecipientDto[] = await this.getEmployeeNumbersByPermission('management_time_off_template');
    console.log("recipientsObjects: ", recipientsObjects);

    if (recipientsObjects.length === 0) {
      console.warn('⚠️ No Management recipientsObjects found for permission: management_time_off_template');
      return { success: true, templateName: 'management_time_off_template', subject: '', total: 0 };
    }

    // 2) Arma el DTO que espera el Email Service
    const subject = ``;

    const dto: SendTimeOffTemplateObjDto = {
      recipientsObjects,                         // <-- string[]
      templateName: 'management_time_off_request',
      subject,
      formData: updatedRequest
    };

    // 3) Envía usando el API client
    try {
      // Asegúrate de tener this.apiClient instanciado (por constructor o DI)
      const resp = await this.apiClient.sendManagementTemplate(dto);
      console.log('✅ Management email service response:', resp);
      return resp;
    } catch (err: any) {
      console.error('❌ Error sending Management template:', err?.message ?? err);
      throw err;
    }

  }

  /* async findByStatus(status: string): Promise<TimeOffRequest[]> {
    if (status.toLowerCase() === 'all') {
      return this.timeOffRequestRepo.find();
    }

    return this.timeOffRequestRepo.find({
      where: { status: this.normalizeStatus(status) },
    });
  } */
  async findByStatus(status: string): Promise<TimeOffRequest[]> {
    const s = (status ?? '').trim().toLowerCase();
    if (s === 'all') return this.timeOffRequestRepo.find();

    // normalización inline (sin función extra)
    const normalized: StatusEnum =
      s === 'approved'
        ? StatusEnum.Approved
        : s === 'not approved' || s === 'not_approved' || s === 'notapproved'
          ? StatusEnum.NotApproved
          : StatusEnum.Pending;

    return this.timeOffRequestRepo.find({ where: { status: normalized } });
  }

  private normalizeStatus(input: string): string {
    // Normaliza el texto (puedes expandir esto si hace falta)
    switch (input.toLowerCase()) {
      case 'pending':
        return 'Pending';
      case 'approved':
        return 'Approved';
      case 'not approved':
        return 'Not Approved';
      default:
        return 'Pending'; // fallback por seguridad
    }
  }

  async findCoordinatorByStatusAndDepartment(
    status: string,
    department: string
  ): Promise<TimeOffRequest[]> {
    console.log("<< Fetching requests by status and department:", status, department);

    const query = this.timeOffRequestRepo.createQueryBuilder('request');

    const whereClauses: string[] = [];
    const params: Record<string, any> = {};

    // Departamento (solo si no es 'All')
    if (department !== 'All') {
      whereClauses.push(`request.employee_data ->> 'department' = :department`);
      params.department = department;
    }

    // Lógica por status
    if (status === 'Pending') {
      whereClauses.push(`request.status = 'Pending'`);
      whereClauses.push(`request.coordinator_approval ->> 'approved' = 'false'`);
    } else if (status === 'Approved') {
      whereClauses.push(`request.status = 'Pending'`);
      whereClauses.push(`request.coordinator_approval ->> 'approved' = 'true'`);
    } else if (status === 'Not Approved') {
      whereClauses.push(`request.status = 'Not Approved'`);
      whereClauses.push(`request.coordinator_approval ->> 'approved' = 'false'`);
    }

    if (whereClauses.length > 0) {
      query.where(whereClauses.join(' AND '), params);
    }

    // 👇 Ordenar por fecha y hora descendente (más reciente primero)
    query.orderBy(`request.createdDate`, 'DESC')
      .addOrderBy(`request.createdTime`, 'DESC');

    return await query.getMany();
  }

  /* async findHrByStatusDepartmentAndEmployee(
    status: string,
    department: string,
    employee_number?: string
  ): Promise<TimeOffRequest[]> {
    console.log("<< Fetching requests:", { status, department, employee_number });

    const query = this.timeOffRequestRepo.createQueryBuilder('request');

    // 🔷 Departamento
    if (department !== 'All') {
      query.andWhere(`request.employee_data ->> 'department' = :department`, { department });
    }

    // 🔷 Employee Number (opcional)
    if (employee_number) {
      query.andWhere(`request.employee_data ->> 'employee_number' = :employee_number`, { employee_number });
    }

    // 🔷 Lógica por status
    const normalizedStatus = status.toLowerCase();

    if (normalizedStatus === 'pending') {
      query.andWhere(`request.status = 'Pending'`)
        .andWhere(`request.hr_approval ->> 'approved' = 'false'`)
        .andWhere(`(request.coordinator_approval ->> 'approved' = 'true' OR request.coordinator_approval ->> 'approved' = 'false')`);
    } else if (normalizedStatus === 'approved') {
      query.andWhere(`request.hr_approval ->> 'approved' = 'true'`)
        .andWhere(`request.coordinator_approval ->> 'approved' = 'true'`);
    } else if (normalizedStatus === 'not approved') {
      query.andWhere(`request.status = 'Not Approved'`)
        .andWhere(`request.hr_approval ->> 'approved' = 'false'`);
    }

    return query.getMany();
  } */
  async findHrByStatusDepartmentAndEmployee(
    status: string,
    multi_department: string[] = [],
    employee_number?: string
  ): Promise<TimeOffRequest[]> {
    const query = this.timeOffRequestRepo.createQueryBuilder('request');

    const depts = multi_department.map(d => d.trim()).filter(Boolean);
    const shouldFilterByDept = depts.length > 0;

    if (shouldFilterByDept) {
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
    } else if (s === 'cancelled') {     // ✅ caso nuevo
      query.andWhere(`request.status = 'Cancelled'`);
    }

    return query.getMany();
  }

  /* FIND COORDINATOR EMAIL BY DEPARTMENT */
  async sentCoordinatorRequest(payload: CreateTimeOffRequestSavedDto) {/*  */
    console.log("---------------- sentCoordinatorRequest ----------------");
    console.log("payload: ", payload);

    const departments = payload.employee_data.multi_department

    /*  const coordinatorEmails = await this.employeeService.findCoordinatorsEmailsByDepartments({
       departments
     }) */

    /* GET SUPERVISORS EMAIL */
    const coordinatorEmails = await this.employeeService.getSupervisorsEmailsByEmployeeNumber(payload.employee_data.employee_number);

    console.log("coordinatorEmails: ", coordinatorEmails);

    if (coordinatorEmails.length === 0) {
      console.warn('⚠️ No coordinators found for departments:', departments);
      return;
    }

    // construyes el DTO para enviar al microservicio de email
    const dto = {
      recipients: coordinatorEmails,
      templateName: '',
      formData: payload, // 👈 aquí mandas todo el payload como formData
      subject: ``,
    };

    console.log("dto: ", dto);

    console.log("---------------------------------");

    try {
      /* SENDING TO STAFF NOTIFICATION */
      dto.templateName = 'staff_submitted_time_off_request'
      const respStaff = await this.apiClient.sendStaffSubmittedTorTemplate(dto);
      console.log('✅ Email/Staff service response:', respStaff);

      /* SENDING TO COORDINATOR NOTIFICATION */
      dto.templateName = 'coordinator_time_off_request'
      const resp = await this.apiClient.sendCoordinatorTemplate(dto);
      console.log('✅ Email/Coordinator service response:', resp);
      return resp;
    } catch (err) {
      console.error('❌ Error sending coordinator template:', err.message);
      throw err;
    }
  }

  async getEmployeeNumbersByPermission(perm: string): Promise<any[]> {
    const t0 = Date.now();
    const p = (perm ?? '').trim();

    console.log(`[perm] init :: perm="${p}"`);

    if (!p) {
      console.warn('[perm] missing "perm"');
      throw new BadRequestException('Query param "perm" es requerido');
    }

    let baseUrl = (process.env.NOVA_ONE_API ?? '').trim(); // ej: http://localhost:5001
    console.log(`[perm] baseUrl="${baseUrl}"`);
    if (!baseUrl) throw new BadRequestException('NOVA_ONE_API no está configurado.');
    baseUrl = baseUrl.replace(/\/$/, '');

    const path = '/permissions/employee-numbers-by-permission';
    const url = `${baseUrl}${path}`;
    console.log(`[perm] url="${url}"`);

    try {
      // Primer intento
      const resp = await axios.get<EmployeeNumbersByPermissionResponse>(url, {
        params: { perm: p },
        timeout: 7000,
        proxy: false,
        validateStatus: () => true, // logear aunque no sea 200
      });

      console.log(`[perm] HTTP ${resp.status} :: ${Date.now() - t0}ms`);
      try {
        console.log('[perm] data preview:', JSON.stringify(resp.data).slice(0, 400));
      } catch {
        console.log('[perm] data preview: [unserializable]');
      }

      if (resp.status >= 500) {
        console.warn(`[perm] upstream >=500: ${resp.status}`);
        throw new ServiceUnavailableException(`Upstream error ${resp.status}`);
      }
      if (resp.status >= 400) {
        console.warn(`[perm] upstream >=400: ${resp.status}`);
        throw new BadRequestException(`Upstream returned ${resp.status}: ${JSON.stringify(resp.data)}`);
      }

      let nums: string[] = [];

      // Formas aceptadas
      if (Array.isArray((resp.data as any)?.employee_numbers)) {
        nums = (resp.data as any).employee_numbers;
      } else if (Array.isArray(resp.data)) {
        nums = resp.data as unknown as string[];
      } else {
        console.warn('[perm] unexpected shape:', JSON.stringify(resp.data).slice(0, 400));
        throw new InternalServerErrorException('Unexpected response shape');
      }

      // Reintentos típicos si viene vacío y es localhost (Docker/WSL)
      if (nums.length === 0 && /localhost/i.test(baseUrl)) {
        const altUrl127 = url.replace('localhost', '127.0.0.1');
        console.warn(`[perm] empty result; retry -> ${altUrl127}`);
        const alt127 = await axios.get<EmployeeNumbersByPermissionResponse>(altUrl127, {
          params: { perm: p },
          timeout: 5000,
          proxy: false,
          validateStatus: () => true,
        });
        console.log(`[perm] alt(127) HTTP ${alt127.status}`);
        if (alt127.status === 200 && Array.isArray(alt127.data?.employee_numbers)) {
          nums = alt127.data.employee_numbers;
        } else if (alt127.status !== 200) {
          throw new BadRequestException(`Alt(127) returned ${alt127.status}: ${JSON.stringify(alt127.data)}`);
        }

        if (nums.length === 0) {
          const altHost = url.replace('localhost', 'host.docker.internal');
          console.warn(`[perm] still empty; retry -> ${altHost}`);
          const altH = await axios.get<EmployeeNumbersByPermissionResponse>(altHost, {
            params: { perm: p },
            timeout: 5000,
            proxy: false,
            validateStatus: () => true,
          });
          console.log(`[perm] alt(host) HTTP ${altH.status}`);
          if (altH.status === 200 && Array.isArray(altH.data?.employee_numbers)) {
            nums = altH.data.employee_numbers;
          } else if (altH.status !== 200) {
            throw new BadRequestException(`Alt(host) returned ${altH.status}: ${JSON.stringify(altH.data)}`);
          }
        }
      }

      console.log(`[perm] done :: items=${nums.length} :: ${Date.now() - t0}ms`);
      return nums;
    } catch (e: any) {
      if (e?.isAxiosError) {
        console.error('[perm] axios error :: code=', e.code, 'msg=', e.message, 'elapsed=', Date.now() - t0, 'ms');
        if (e.response) {
          try {
            console.error('[perm] axios response :: status=', e.response.status, 'data=', JSON.stringify(e.response.data).slice(0, 800));
          } catch {
            console.error('[perm] axios response :: status=', e.response.status, 'data=[unserializable]');
          }
        } else if (e.request) {
          console.error('[perm] axios request :: no response (timeout/DNS/ECONNREFUSED?)');
        }
      } else {
        console.error('[perm] error ::', e?.message || e);
        if (e?.stack) console.error(e.stack);
      }

      if (
        e instanceof BadRequestException ||
        e instanceof InternalServerErrorException ||
        e instanceof ServiceUnavailableException
      ) {
        throw e;
      }
      throw new InternalServerErrorException(e?.message || 'Unknown error');
    }
  }

  // Reemplaza el método cancelRequest existente
  async cancelRequest(
    id: string,
    cancelled_by: string,
    role: 'staff' | 'hr' | 'coordinator',
    reason?: string,
  ): Promise<{ message: string; data: TimeOffRequest }> {
    try {
      console.log('🟥 [cancelRequest] START');
      console.log(
        '🟥 [cancelRequest] incoming:',
        JSON.stringify({ id, cancelled_by, role, reason }, null, 2),
      );

      const request = await this.findOne(id);

      console.log(
        '🟥 [cancelRequest] request found:',
        JSON.stringify(
          {
            id: request.id,
            status: request.status,
            employee_number: request.employee_data?.employee_number,
            hr_approval: request.hr_approval,
            coordinator_approval: request.coordinator_approval,
          },
          null,
          2,
        ),
      );

      const cancellableStatuses: StatusEnum[] = [
        StatusEnum.Pending,
        StatusEnum.Approved,
      ];

      if (!cancellableStatuses.includes(request.status)) {
        throw new BadRequestException(
          `Cannot cancel a request with status "${request.status}". Only Pending or Approved requests can be cancelled.`,
        );
      }

      const wasApproved = request.status === StatusEnum.Approved;
      console.log('🟥 [cancelRequest] wasApproved:', wasApproved);

      const chicagoNow = moment().tz('America/Chicago');

      request.status = StatusEnum.Cancelled;
      request.cancellation_info = {
        cancelled_by,
        role,
        reason: reason ?? '',
        date: chicagoNow.format('YYYY-MM-DD'),
        time: chicagoNow.format('HH:mm:ss'),
      };

      const updated = await this.timeOffRequestRepo.save(request);

      console.log(
        '🟥 [cancelRequest] request updated:',
        JSON.stringify(
          {
            id: updated.id,
            status: updated.status,
            cancellation_info: updated.cancellation_info,
          },
          null,
          2,
        ),
      );

      // Solo si ANTES estaba Approved, se borran eventos del schedule
      if (wasApproved) {
        console.log(
          `🧩 [cancelRequest] TOR ${id} was approved, deleting schedule events and recovery hours...`,
        );

        await this._deleteScheduleEventsFromTimeOff(updated);

        console.log(
          `✅ [cancelRequest] schedule events deleted for TOR ${id}`,
        );
      } else {
        console.log(
          `ℹ️ [cancelRequest] TOR ${id} was not approved yet, no schedule events to delete`,
        );
      }

      try {
        await this.apiClient.sendStaffTemplate({
          templateName: 'time_off_staff_notification',
          formData: { ...updated },
          actor:
            role === 'hr'
              ? 'HR'
              : role === 'coordinator'
                ? 'Coordinator'
                : 'System',
        });
      } catch (err) {
        this.logger.warn(
          `[cancelRequest] Cancel notification failed for request ${id}: ${err?.message}`,
        );
      }

      console.log('🏁 [cancelRequest] END');

      return {
        message: `Time-off request cancelled by ${cancelled_by} (${role})`,
        data: updated,
      };
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }

      this.logger.error(`[cancelRequest] Failed for request ID ${id}`, error.stack);
      throw new InternalServerErrorException('Error cancelling time off request');
    }
  }

  // ✅ NUEVO método reopenRequest
  async reopenRequest(
    id: string,
    reopened_by: string,
  ): Promise<{ message: string; data: TimeOffRequest }> {
    const request = await this.findOne(id);

    const reopenableStatuses: StatusEnum[] = [StatusEnum.NotApproved, StatusEnum.Cancelled];
    if (!reopenableStatuses.includes(request.status)) {
      throw new BadRequestException(
        `Cannot reopen a request with status "${request.status}". Only Not Approved or Cancelled requests can be reopened.`,
      );
    }

    const chicagoNow = moment().tz('America/Chicago');

    request.status = StatusEnum.Pending;
    request.coordinator_approval = { approved: false, by: '', date: '', time: '' };
    request.hr_approval = { approved: false, by: '', date: '', time: '' };
    request.coordinator_comments = '';   // ✅ string vacío en lugar de null
    request.hr_comments = '';   // ✅ string vacío en lugar de null
    request.cancellation_info = null; // este sí acepta null según la entity

    const updated = await this.timeOffRequestRepo.save(request);

    try {
      await this.sentCoordinatorRequest(updated as any);
    } catch (err) {
      this.logger.warn(`Reopen coordinator notification failed for request ${id}: ${err?.message}`);
    }

    return {
      message: `Time-off request reopened by ${reopened_by}`,
      data: updated,
    };
  }

  async getKpiCounts(multi_department: string[] = []): Promise<{
    pendingCoordinator: number;
    pendingHR: number;
    approved: number;
    notApproved: number;
    cancelled: number;
    total: number;
  }> {
    const base = this.timeOffRequestRepo.createQueryBuilder('request');

    // Filtro de departamento si aplica
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

    // Pending Coordinator: status=Pending AND coordinator_approval.approved=false
    const pendingCoordinator = await applyDeptFilter(
      this.timeOffRequestRepo.createQueryBuilder('request')
        .andWhere(`request.status = 'Pending'`)
        .andWhere(`request.coordinator_approval ->> 'approved' = 'false'`)
    ).getCount();

    // Pending HR: status=Pending AND coordinator_approval.approved=true AND hr_approval.approved=false
    const pendingHR = await applyDeptFilter(
      this.timeOffRequestRepo.createQueryBuilder('request')
        .andWhere(`request.status = 'Pending'`)
        .andWhere(`request.coordinator_approval ->> 'approved' = 'true'`)
        .andWhere(`request.hr_approval ->> 'approved' = 'false'`)
    ).getCount();

    // Approved
    const approved = await applyDeptFilter(
      this.timeOffRequestRepo.createQueryBuilder('request')
        .andWhere(`request.status = 'Approved'`)
    ).getCount();

    // Not Approved
    const notApproved = await applyDeptFilter(
      this.timeOffRequestRepo.createQueryBuilder('request')
        .andWhere(`request.status = 'Not Approved'`)
    ).getCount();

    // Cancelled
    const cancelled = await applyDeptFilter(
      this.timeOffRequestRepo.createQueryBuilder('request')
        .andWhere(`request.status = 'Cancelled'`)
    ).getCount();

    const total = pendingCoordinator + pendingHR + approved + notApproved + cancelled;

    return { pendingCoordinator, pendingHR, approved, notApproved, cancelled, total };
  }

  private async _createScheduleEventsFromTimeOff(request: TimeOffRequest): Promise<void> {
    try {
      console.log('🟦 [_createScheduleEventsFromTimeOff] START');
      console.log(
        '🟦 [_createScheduleEventsFromTimeOff] request summary:',
        JSON.stringify(
          {
            id: request?.id,
            timeType: request?.timeType,
            recovery_required: request?.recovery_required,
            recovery_schedule: request?.recovery_schedule,
            is_paid: request?.is_paid,
            hourDate: request?.hourDate,
            startTime: request?.startTime,
            endTime: request?.endTime,
            startDate: request?.startDate,
            endDate: request?.endDate,
            employee_number: request?.employee_data?.employee_number,
            multi_location: request?.employee_data?.multi_location,
          },
          null,
          2,
        ),
      );

      const { timeType, employee_data } = request;
      const employeeNumber = employee_data?.employee_number;

      if (!employeeNumber) {
        console.log('❌ [_createScheduleEventsFromTimeOff] No employee_number found, skipping');
        return;
      }

      const normalizedRecoverySchedule = Array.isArray(request.recovery_schedule)
        ? request.recovery_schedule
          .map((item, index) => {
            if (!item?.date || !item?.startTime || !item?.endTime) {
              console.log(
                `❌ [_createScheduleEventsFromTimeOff] invalid recovery slot #${index + 1}:`,
                JSON.stringify(item, null, 2),
              );
              return null;
            }

            const startUTC = moment
              .tz(
                `${item.date} ${String(item.startTime).substring(0, 5)}`,
                'YYYY-MM-DD HH:mm',
                'America/Chicago',
              )
              .utc()
              .format('YYYY-MM-DDTHH:mm:ss');

            const endUTC = moment
              .tz(
                `${item.date} ${String(item.endTime).substring(0, 5)}`,
                'YYYY-MM-DD HH:mm',
                'America/Chicago',
              )
              .utc()
              .format('YYYY-MM-DDTHH:mm:ss');

            const normalized = {
              date: item.date,
              start: startUTC,
              end: endUTC,
              location: employee_data?.multi_location ?? [],
              strict: false,
              notes: null,
            };

            console.log(
              `🟨 [_createScheduleEventsFromTimeOff] normalized recovery slot #${index + 1}:`,
              JSON.stringify(
                {
                  raw: item,
                  normalized,
                },
                null,
                2,
              ),
            );

            return normalized;
          })
          .filter((item): item is {
            date: string;
            start: string;
            end: string;
            location: string[];
            strict: boolean;
            notes: null;
          } => item !== null)
        : [];

      console.log(
        '🟨 [_createScheduleEventsFromTimeOff] normalizedRecoverySchedule.length:',
        normalizedRecoverySchedule.length,
      );

      const events: Array<{
        id: null;
        date: string;
        start: string;
        end: string;
        register: RegisterEnum;
        location: string[];
        uuid_tor: string;
        is_paid: boolean;
        will_make_up_hours: boolean;
        make_up_schedule: Array<{
          date: string;
          start: string;
          end: string;
          location: string[];
          strict: boolean;
          notes: string | null;
        }>;
        strict: boolean;
      }> = [];

      if (timeType === TimeTypeEnum.Days) {
        const { startDate, endDate } = request;
        const start = moment(startDate, 'YYYY-MM-DD');
        const end = moment(endDate, 'YYYY-MM-DD');

        console.log('🟦 [_createScheduleEventsFromTimeOff] DAYS branch');
        console.log('🟦 [_createScheduleEventsFromTimeOff] parsed start valid:', start.isValid(), 'value:', startDate);
        console.log('🟦 [_createScheduleEventsFromTimeOff] parsed end valid:', end.isValid(), 'value:', endDate);

        if (!start.isValid() || !end.isValid()) {
          console.log('❌ [_createScheduleEventsFromTimeOff] Invalid dates (Days), skipping');
          return;
        }

        const totalDays = end.diff(start, 'days') + 1;
        console.log('🟦 [_createScheduleEventsFromTimeOff] totalDays:', totalDays);

        for (let i = 0; i < totalDays; i++) {
          const day = start.clone().add(i, 'days');
          const dateStr = day.format('YYYY-MM-DD');

          const startUTC = moment
            .tz(`${dateStr} 09:00`, 'YYYY-MM-DD HH:mm', 'America/Chicago')
            .utc()
            .format('YYYY-MM-DDTHH:mm:ss');

          const endUTC = moment
            .tz(`${dateStr} 18:00`, 'YYYY-MM-DD HH:mm', 'America/Chicago')
            .utc()
            .format('YYYY-MM-DDTHH:mm:ss');

          const event = {
            id: null,
            date: dateStr,
            start: startUTC,
            end: endUTC,
            register: RegisterEnum.TIME_OFF_REQUEST,
            location: employee_data?.multi_location ?? [],
            uuid_tor: request.id,
            is_paid: request.is_paid ?? false,
            will_make_up_hours: request.recovery_required ?? false,
            make_up_schedule: normalizedRecoverySchedule,
            strict: false,
          };

          console.log(
            `🟩 [_createScheduleEventsFromTimeOff] parent DAYS event #${i + 1}:`,
            JSON.stringify(event, null, 2),
          );

          events.push(event);
        }
      } else if (timeType === TimeTypeEnum.Hours) {
        const { hourDate, startTime, endTime } = request;

        console.log('🟦 [_createScheduleEventsFromTimeOff] HOURS branch');
        console.log(
          '🟦 [_createScheduleEventsFromTimeOff] raw hour inputs:',
          JSON.stringify({ hourDate, startTime, endTime }, null, 2),
        );

        if (!hourDate || !startTime || !endTime) {
          console.log('❌ [_createScheduleEventsFromTimeOff] Missing hourDate/startTime/endTime (Hours), skipping');
          return;
        }

        const dateStr = moment(hourDate, 'YYYY-MM-DD').format('YYYY-MM-DD');

        const startUTC = moment
          .tz(`${dateStr} ${startTime.substring(0, 5)}`, 'YYYY-MM-DD HH:mm', 'America/Chicago')
          .utc()
          .format('YYYY-MM-DDTHH:mm:ss');

        const endUTC = moment
          .tz(`${dateStr} ${endTime.substring(0, 5)}`, 'YYYY-MM-DD HH:mm', 'America/Chicago')
          .utc()
          .format('YYYY-MM-DDTHH:mm:ss');

        const event = {
          id: null,
          date: dateStr,
          start: startUTC,
          end: endUTC,
          register: RegisterEnum.TIME_OFF_REQUEST,
          location: employee_data?.multi_location ?? [],
          uuid_tor: request.id,
          is_paid: request.is_paid ?? false,
          will_make_up_hours: request.recovery_required ?? false,
          make_up_schedule: normalizedRecoverySchedule,
          strict: false,
        };

        console.log(
          '🟩 [_createScheduleEventsFromTimeOff] parent HOURS event:',
          JSON.stringify(event, null, 2),
        );

        events.push(event);
      } else {
        console.log(`❌ [_createScheduleEventsFromTimeOff] Unknown timeType: ${timeType}, skipping`);
        return;
      }

      if (!events.length) {
        console.log('❌ [_createScheduleEventsFromTimeOff] No events to create, skipping');
        return;
      }

      const payload = {
        employee_number: employeeNumber,
        fixed: [],
        events,
      };

      console.log(
        '📦 [_createScheduleEventsFromTimeOff] payload to employeeScheduleService.create:',
        JSON.stringify(payload, null, 2),
      );

      await this.employeeScheduleService.create(payload as any);

      console.log(`✅ [_createScheduleEventsFromTimeOff] Done for ${employeeNumber}`);
    } catch (err) {
      console.log('❌ [_createScheduleEventsFromTimeOff] ERROR MESSAGE:', err?.message);
      console.log('❌ [_createScheduleEventsFromTimeOff] ERROR STACK:', err?.stack);
      this.logger.warn(`[_createScheduleEventsFromTimeOff] Failed (non-blocking): ${err?.message}`);
    }
  }


  private async _deleteScheduleEventsFromTimeOff(request: TimeOffRequest): Promise<void> {
    try {
      const employeeNumber = request.employee_data?.employee_number;

      if (!employeeNumber) {
        this.logger.warn('[_deleteScheduleEventsFromTimeOff] No employee_number found, skipping');
        return;
      }

      const schedule = await this.employeeScheduleRepo.findOne({
        where: { employee_number: employeeNumber },
      });

      if (!schedule) {
        this.logger.warn(`[_deleteScheduleEventsFromTimeOff] No schedule found for ${employeeNumber}, skipping`);
        return;
      }

      // ── Borra directo por uuid_tor — no importa timeType ni fechas ───────────
      const result = await this.scheduleEventRepo
        .createQueryBuilder()
        .delete()
        .from(ScheduleEvent)
        .where('"scheduleId" = :scheduleId', { scheduleId: schedule.id })
        .andWhere('uuid_tor = :uuid_tor', { uuid_tor: request.id })
        .execute();

      this.logger.log(
        `[_deleteScheduleEventsFromTimeOff] ✅ Deleted ${result.affected} event(s) for ${employeeNumber} | uuid_tor: ${request.id}`
      );

    } catch (err) {
      this.logger.warn(`[_deleteScheduleEventsFromTimeOff] Failed (non-blocking): ${err?.message}`);
    }
  }

}

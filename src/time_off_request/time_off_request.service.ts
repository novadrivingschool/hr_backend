import { Injectable, NotFoundException, InternalServerErrorException, Logger, BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';
import { TimeOffRequest } from './entities/time_off_request.entity';
import { CreateTimeOffRequestDto } from './dto/create-time_off_request.dto';
import { UpdateTimeOffRequestDto } from './dto/update-time_off_request.dto';
import * as moment from 'moment-timezone';
import { CreateTimeOffRequestSavedDto, RecipientDto, SendTimeOffTemplateDto, SendTimeOffTemplateObjDto } from './dto/time-off.dto';
import axios from 'axios';
import { StatusEnum } from './enums';
import { EmployeesService } from 'src/employees/employees.service';
import { TimeOffApiClient } from './api/time-off.api';

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
    private readonly employeeService: EmployeesService,
  ) {
    this.apiClient = new TimeOffApiClient();
  }

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

      /* COORDINATOR EMAIL */
      await this.sentCoordinatorRequest(saved);

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
      const request = await this.findOne(id);
      const updated = Object.assign(request, updateDto);
      return await this.timeOffRequestRepo.save(updated);
    } catch (error) {
      this.logger.error(`Failed to update request ID ${id}`, error.stack);
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
      console.log("---------------------------------");
      console.log("Approving by COORDINATOR")
      console.log("id: ", id)
      console.log("coordinator_comments: ", coordinator_comments)
      console.log("approved: ", approved)
      console.log("---------------------------------");
      const request = await this.findOne(id);

      if (!request) {
        throw new NotFoundException(`Time-off request with ID ${id} not found`);
      }

      const chicagoNow = moment().tz('America/Chicago');
      /* request.coordinator_approval = { approved, by };       */
      request.coordinator_approval = {
        approved,
        by,
        date: chicagoNow.format('YYYY-MM-DD'),
        time: chicagoNow.format('HH:mm:ss'),
      };

      console.log("approved: ", approved);
      console.log("coordinator_comments: ", coordinator_comments);

      if (!approved) {
        request.hr_comments = `Not approved by Coordinator ${by}`
        request.status = StatusEnum.NotApproved;//'Not Approved';
        request.hr_approval = {
          approved,
          by,
          date: chicagoNow.format('YYYY-MM-DD'),
          time: chicagoNow.format('HH:mm:ss'),
        };
      }
      request.coordinator_comments = coordinator_comments;

      const updatedRequest = await this.timeOffRequestRepo.save(request);
      console.log("updatedRequest: ", updatedRequest);
      

      if (approved) {
        /* GET HR EMAILS */
        const res = await this.sendHrEmail(updatedRequest);
        console.log("res: ", res);
        await this.apiClient.sendStaffTemplate({
          templateName: 'time_off_staff_notification',
          formData: { ...updatedRequest },
          actor: 'Coordinator'
        });
      } else {
        /* SEND NOTIFICATION TO STAFF */
        await this.apiClient.sendStaffTemplate({
          templateName: 'time_off_staff_notification',
          formData: { ...updatedRequest },
          actor: 'Coordinator'
        });
      }

      return {
        message: `Time-off request ${approved ? 'approved' : 'rejected'} successfully by ${by}`,
        data: updatedRequest
      };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }

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

  async approveByHR(id: string, approved: boolean, by: string, hr_comments: string): Promise<TimeOffRequest> {
    try {
      const request = await this.findOne(id);

      /* request.hr_approval = { approved, by }; */
      const chicagoNow = moment().tz('America/Chicago');

      request.hr_approval = {
        approved,
        by,
        date: chicagoNow.format('YYYY-MM-DD'),
        time: chicagoNow.format('HH:mm:ss'),
      };

      //request.status = approved ? 'Approved' : 'Not Approved';
      request.status = approved ? StatusEnum.Approved : StatusEnum.NotApproved;
      request.hr_comments = hr_comments;

      const updatedRequest = await this.timeOffRequestRepo.save(request);

      /* GET MANAGEMENT EMAILS */
      const res = await this.sendManagementEmail(updatedRequest);
      console.log("res: ", res);

      /* SEND NOTIFICATION TO STAFF */
      await this.apiClient.sendStaffTemplate({
        templateName: 'time_off_staff_notification',
        formData: { ...updatedRequest },
        actor: 'HR'
      });

      return updatedRequest;
    } catch (error) {
      this.logger.error(`HR approval failed for request ID ${id}`, error.stack);
      throw new InternalServerErrorException('Error approving by HR');
    }
  }

  /* SEND EMAIL TO MANAGEMENT TIME OFF REQUEST */
  async sendManagementEmail(updatedRequest: CreateTimeOffRequestSavedDto) {
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
    }

    return query.getMany();
  }

  /* FIND COORDINATOR EMAIL BY DEPARTMENT */
  async sentCoordinatorRequest(payload: CreateTimeOffRequestSavedDto) {/*  */
    console.log("---------------- sentCoordinatorRequest ----------------");
    console.log("payload: ", payload);

    const departments = payload.employee_data.multi_department

    const coordinatorEmails = await this.employeeService.findCoordinatorsEmailsByDepartments({
      departments
    })

    console.log("coordinatorEmails: ", coordinatorEmails);

    if (coordinatorEmails.length === 0) {
      console.warn('⚠️ No coordinators found for departments:', departments);
      return;
    }

    // construyes el DTO para enviar al microservicio de email
    const dto = {
      recipients: coordinatorEmails,
      templateName: 'coordinator_time_off_request',
      formData: payload, // 👈 aquí mandas todo el payload como formData
      subject: ``,
    };

    try {
      const resp = await this.apiClient.sendCoordinatorTemplate(dto);
      console.log('✅ Email service response:', resp);
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



}

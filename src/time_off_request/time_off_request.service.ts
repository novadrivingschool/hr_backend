import { Injectable, NotFoundException, InternalServerErrorException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TimeOffRequest } from './entities/time_off_request.entity';
import { CreateTimeOffRequestDto } from './dto/create-time_off_request.dto';
import { UpdateTimeOffRequestDto } from './dto/update-time_off_request.dto';
import * as moment from 'moment-timezone';

@Injectable()
export class TimeOffRequestService {
  private readonly logger = new Logger(TimeOffRequestService.name);

  constructor(
    @InjectRepository(TimeOffRequest)
    private readonly timeOffRequestRepo: Repository<TimeOffRequest>,
  ) { }

  async create(createDto: CreateTimeOffRequestDto): Promise<TimeOffRequest> {
    try {
      const chicagoNow = moment().tz('America/Chicago');
      const request = this.timeOffRequestRepo.create({
        ...createDto,
        status: 'Pending',
        createdDate: chicagoNow.format('YYYY-MM-DD'),
        createdTime: chicagoNow.format('HH:mm:ss'),
        coordinator_approval: { approved: false, by: '' },
        hr_approval: { approved: false, by: '' },
      });
      return await this.timeOffRequestRepo.save(request);
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


  async updateStatus(id: string, status: 'Pending' | 'Approved' | 'Not Approved'): Promise<TimeOffRequest> {
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
        request.status = 'Not Approved';
        request.hr_approval = {
          approved,
          by,
          date: chicagoNow.format('YYYY-MM-DD'),
          time: chicagoNow.format('HH:mm:ss'),
        };
      }
      request.coordinator_comments = coordinator_comments;

      const updatedRequest = await this.timeOffRequestRepo.save(request);

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

      request.status = approved ? 'Approved' : 'Not Approved';
      request.hr_comments = hr_comments;

      return await this.timeOffRequestRepo.save(request);
    } catch (error) {
      this.logger.error(`HR approval failed for request ID ${id}`, error.stack);
      throw new InternalServerErrorException('Error approving by HR');
    }
  }

  async findByStatus(status: string): Promise<TimeOffRequest[]> {
    if (status.toLowerCase() === 'all') {
      return this.timeOffRequestRepo.find();
    }

    return this.timeOffRequestRepo.find({
      where: { status: this.normalizeStatus(status) },
    });
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

  /* async findByStatusAndDepartment(status: string, department: string): Promise<TimeOffRequest[]> {
    //const normalizedStatus = this.normalizeStatus(status);
    console.log("<< Fetching requests by status and department:", status, department);

    const query = this.timeOffRequestRepo.createQueryBuilder('request');

    if (status !== 'All') {
      query.where('request.status = :status', { status: status });
    }

    // JSONB filter: request.employee_data ->> 'department' = 'HR'
    query.andWhere(`request.employee_data ->> 'department' = :department`, { department });

    return await query.getMany();
  } */
  /* async findByStatusAndDepartment(status: string, department: string): Promise<TimeOffRequest[]> {
    console.log("<< Fetching requests by status and department:", status, department);

    const query = this.timeOffRequestRepo.createQueryBuilder('request');

    if (status !== 'All') {
      console.log("Filtering by status:", status);
      console.log("Filtering by department:", department);
      query.where('request.status = :status', { status })
        .andWhere(`request.employee_data ->> 'department' = :department`, { department });
    } else {
      console.log("No status filter applied, only department filter:", department);
      query.where(`request.employee_data ->> 'department' = :department`, { department });
    }

    return await query.getMany();
  } */
  /* async findByStatusAndDepartment(status: string, department: string): Promise<TimeOffRequest[]> {
    console.log("<< Fetching requests by status and department:", status, department);

    const query = this.timeOffRequestRepo.createQueryBuilder('request');

    // Caso especial: status = 'Pending' y department !== 'Human Resources Department'
    if (status === 'Pending' && department !== 'Human Resources Department') {
      query.where(`request.status = :status`, { status })
        .andWhere(`request.employee_data ->> 'department' = :department`, { department })
        .andWhere(`request.coordinator_approval ->> 'approved' = 'false'`);
    }

    // Caso normal: filtrar por status y departamento
    else if (status !== 'All') {
      query.where(`request.status = :status`, { status })
        .andWhere(`request.employee_data ->> 'department' = :department`, { department });
    }

    // Solo departamento
    else {
      query.where(`request.employee_data ->> 'department' = :department`, { department });
    }

    return await query.getMany();
  } */
  /* async findCoordinatorByStatusAndDepartment(status: string, department: string): Promise<TimeOffRequest[]> {
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

    // Aplica condiciones solo si hay alguna
    if (whereClauses.length > 0) {
      query.where(whereClauses.join(' AND '), params);
    }

    return await query.getMany();
  } */
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


  /* async findHrByStatusAndDepartment(
    status: string,
    department: string
  ): Promise<TimeOffRequest[]> {
    console.log("<< Fetching requests by status and department:", status, department);

    const query = this.timeOffRequestRepo.createQueryBuilder('request');

    // 🔷 Departamento (solo si no es 'All')
    // if (department !== 'All') {
    //   query.andWhere(`request.employee_data ->> 'department' = :department`, { department });
    // }

    // 🔷 Lógica por status
    if (status === 'Pending' || status === 'pending') {
      query.andWhere(`request.status = 'Pending'`)
        .andWhere(`request.hr_approval ->> 'approved' = 'false'`)
        .andWhere(`request.coordinator_approval ->> 'approved' = 'true'`);
    } else if (status === 'Approved' || status === 'approved') {
      query.andWhere(`request.hr_approval ->> 'approved' = 'true'`)
        .andWhere(`request.coordinator_approval ->> 'approved' = 'true'`);
    } else if (status === 'Not Approved' || status === 'not approved') {
      query.andWhere(`request.status = 'Not Approved'`)
        .andWhere(`request.hr_approval ->> 'approved' = 'false'`);
    }

    return query.getMany();
  } */
  async findHrByStatusDepartmentAndEmployee(
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
        .andWhere(`request.coordinator_approval ->> 'approved' = 'true'`);
    } else if (normalizedStatus === 'approved') {
      query.andWhere(`request.hr_approval ->> 'approved' = 'true'`)
        .andWhere(`request.coordinator_approval ->> 'approved' = 'true'`);
    } else if (normalizedStatus === 'not approved') {
      query.andWhere(`request.status = 'Not Approved'`)
        .andWhere(`request.hr_approval ->> 'approved' = 'false'`);
    }

    return query.getMany();
  }



}

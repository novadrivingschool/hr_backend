// src/facilities/facilities.service.ts
import { Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository, Like, In, Between } from 'typeorm'
import { Facility, FacilityStatus } from './entities/facility.entity'
import { CreateFacilityDto } from './dto/create-facility.dto'
import { UpdateFacilityDto } from './dto/update-facility.dto'
import { UpdateStatusDto } from './dto/update-status.dto'
import { QueryFacilityDto } from './dto/query-facility.dto'

@Injectable()
export class FacilitiesService {
  constructor(
    @InjectRepository(Facility)
    private readonly repo: Repository<Facility>,
  ) {}

  async create(createFacilityDto: CreateFacilityDto) {
    const entity = this.repo.create({
      ...createFacilityDto,
      status: createFacilityDto.status || FacilityStatus.PENDING,
    })
    return await this.repo.save(entity)
  }

  async findAll(query: QueryFacilityDto) {
    const page = query.page || 1
    const limit = query.limit || 20
    const skip = (page - 1) * limit

    const where: any = { deleted: false }

    if (query.search) {
      where.request = Like(`%${query.search}%`)
    }

    if (query.ubicacion) {
      where.ubicacion = query.ubicacion
    }

    if (query.employee_number) {
      where.employee_number = query.employee_number
    }

    if (query.status) {
      where.status = query.status
    }

    const [items, total] = await this.repo.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip,
      take: limit,
    })

    return {
      items,
      total,
      page,
      limit,
    }
  }

  async findOne(id: string) {
    const item = await this.repo.findOne({
      where: { id, deleted: false },
    })
    
    if (!item) {
      throw new NotFoundException(`Facility maintenance request with ID ${id} not found`)
    }
    
    return item
  }

  async findByEmployeeNumber(employee_number: string, query: QueryFacilityDto) {
    const page = query.page || 1
    const limit = query.limit || 20
    const skip = (page - 1) * limit

    const where: any = { 
      deleted: false,
      employee_number 
    }

    if (query.search) {
      where.request = Like(`%${query.search}%`)
    }

    if (query.ubicacion) {
      where.ubicacion = query.ubicacion
    }

    if (query.status) {
      where.status = query.status
    }

    const [items, total] = await this.repo.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip,
      take: limit,
    })

    return {
      items,
      total,
      page,
      limit,
    }
  }

  async update(id: string, updateFacilityDto: UpdateFacilityDto) {
    const item = await this.findOne(id)
    
    Object.assign(item, updateFacilityDto)
    return await this.repo.save(item)
  }

  async updateStatus(id: string, updateStatusDto: UpdateStatusDto) {
    const item = await this.findOne(id)
    
    Object.assign(item, {
      status: updateStatusDto.status,
      admin_comments: updateStatusDto.admin_comments || null,
      admin_employee_number: updateStatusDto.admin_employee_number,
      admin_fullName: updateStatusDto.admin_fullName,
      updatedAt: new Date(),
    })
    
    return await this.repo.save(item)
  }

  async addAttachment(id: string, filePath: string) {
    const item = await this.findOne(id)
    
    if (!item.attachments) {
      item.attachments = []
    }
    
    item.attachments.push(filePath)
    return await this.repo.save(item)
  }

  async removeAttachment(id: string, filePath: string) {
    const item = await this.findOne(id)
    
    if (item.attachments) {
      item.attachments = item.attachments.filter(attachment => attachment !== filePath)
    }
    
    return await this.repo.save(item)
  }

  async remove(id: string) {
    const item = await this.findOne(id)
    
    // Soft delete
    item.deleted = true
    await this.repo.save(item)
    
    return { id, deleted: true }
  }

  async getStats() {
    const [total, pending, approved, rejected] = await Promise.all([
      this.repo.count({ where: { deleted: false } }),
      this.repo.count({ where: { deleted: false, status: FacilityStatus.PENDING } }),
      this.repo.count({ where: { deleted: false, status: FacilityStatus.APPROVED } }),
      this.repo.count({ where: { deleted: false, status: FacilityStatus.REJECTED } }),
    ])

    return {
      total,
      pending,
      approved,
      rejected,
    }
  }
}
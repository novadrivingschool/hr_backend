import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateICareReasonDto } from './dto/create-i_care_reason.dto';
import { UpdateICareReasonDto } from './dto/update-i_care_reason.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { ICareReason } from './entities/i_care_reason.entity';
import { Repository } from 'typeorm';

@Injectable()
export class ICareReasonsService {

  constructor(
      @InjectRepository(ICareReason)
      private readonly repository: Repository<ICareReason>,
    ) {}

   async create(dto: CreateICareReasonDto): Promise<ICareReason> {
      const record = this.repository.create(dto);
      return await this.repository.save(record);
    }
  
    async findAll(category?: string): Promise<ICareReason[]> {
      const queryCustom = category ? { where: { category } } : {};
      return await this.repository.find(queryCustom);
    }
  
    async findOne(id: number): Promise<ICareReason> {
      const record = await this.repository.findOneBy({ id });
      if (!record) throw new NotFoundException(`Record with ID ${id} not found`);
      return record;
    }
  
    async update(id: number, dto: UpdateICareReasonDto): Promise<ICareReason> {
      const record = await this.findOne(id);
      this.repository.merge(record, dto);
      return await this.repository.save(record);
    }
  
    async remove(id: number): Promise<{ message: string }> {
      const record = await this.findOne(id);
      await this.repository.remove(record);
      return { message: `Record ${id} deleted successfully` };
    }
}

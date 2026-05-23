import { Injectable, NotFoundException, OnModuleInit, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InvWarehouse } from '../entities/inv_warehouse.entity';
import { CreateWarehouseDto } from '../dto/warehouse/create-warehouse.dto';
import { UpdateWarehouseDto } from '../dto/warehouse/update-warehouse.dto';

@Injectable()
export class WarehousesService implements OnModuleInit {
  private readonly logger = new Logger(WarehousesService.name);

  constructor(
    @InjectRepository(InvWarehouse)
    private readonly repo: Repository<InvWarehouse>,
  ) {}

  async onModuleInit() {
    const existing = await this.repo.findOneBy({ name: 'Main Warehouse' });
    if (!existing) {
      await this.repo.save(
        this.repo.create({
          name: 'Main Warehouse',
          type: 'location',
          code: 'MAIN',
          is_active: true,
        }),
      );
      this.logger.log('✅ Main Warehouse created on first boot');
    }
  }

  async create(dto: CreateWarehouseDto): Promise<InvWarehouse> {
    const entity = this.repo.create(dto);
    return await this.repo.save(entity);
  }

  async findAll(): Promise<InvWarehouse[]> {
    // Main Warehouse always first, rest alphabetically
    const all = await this.repo.find({ order: { name: 'ASC' } });
    const main = all.filter(w => w.name === 'Main Warehouse');
    const rest = all.filter(w => w.name !== 'Main Warehouse');
    return [...main, ...rest];
  }

  async findOne(id: string): Promise<InvWarehouse> {
    const entity = await this.repo.findOneBy({ id });
    if (!entity) throw new NotFoundException(`Warehouse ${id} not found`);
    return entity;
  }

  async update(id: string, dto: UpdateWarehouseDto): Promise<InvWarehouse> {
    const entity = await this.findOne(id);
    const updated = this.repo.merge(entity, dto);
    return await this.repo.save(updated);
  }

  async remove(id: string): Promise<void> {
    const result = await this.repo.delete(id);
    if (result.affected === 0) throw new NotFoundException(`Warehouse ${id} not found`);
  }
}

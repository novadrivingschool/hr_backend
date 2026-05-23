import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InvDispatch } from '../entities/inv_dispatch.entity';
import { InvItem } from '../entities/inv_item.entity';
import { CreateDispatchDto } from '../dto/dispatch/create-dispatch.dto';
import { UpdateDispatchDto } from '../dto/dispatch/update-dispatch.dto';

@Injectable()
export class DispatchesService {
  constructor(
    @InjectRepository(InvDispatch)
    private readonly repo: Repository<InvDispatch>,
    @InjectRepository(InvItem)
    private readonly itemRepo: Repository<InvItem>,
  ) {}

  async create(dto: CreateDispatchDto): Promise<InvDispatch> {
    const entity = this.repo.create({
      from_warehouse_id:   dto.from_warehouse_id   ?? undefined,
      from_warehouse_name: dto.from_warehouse_name  ?? undefined,
      recipient_name:      dto.recipient_name,
      recipient_id:        dto.recipient_id         ?? undefined,
      recipient_type:      dto.recipient_type       ?? 'Staff',
      items:               dto.items                ?? [],
      notes:               dto.notes               ?? undefined,
      dispatched_by:       dto.dispatched_by        ?? undefined,
      dispatched_at:       new Date(),
    });
    const saved = await this.repo.save(entity);
    // Deduct dispatched quantities from source warehouse + write audit log
    await this.deductItems(dto.items ?? [], saved);
    return saved;
  }

  private async deductItems(
    items: Record<string, any>[],
    dispatch: InvDispatch,
  ): Promise<void> {
    const now = new Date().toISOString();
    for (const di of items) {
      const qty = Number(di.quantity || 0);
      if (!qty || !di.item_id) continue;
      const item = await this.itemRepo.findOneBy({ id: di.item_id });
      if (!item) continue;
      const oldQty = item.quantity;
      item.quantity = Math.max(0, item.quantity - qty);
      const actor = (dispatch.dispatched_by && (dispatch.dispatched_by['fullName'] || dispatch.dispatched_by['employee_number']))
        ? dispatch.dispatched_by : null;
      item.history = [
        ...(item.history ?? []),
        {
          at:            now,
          by:            actor,
          action:        'dispatched',
          dispatch_ref:  dispatch.id.slice(0, 8).toUpperCase(),
          transfer_from: dispatch.from_warehouse_name,
          dispatched_to: `${dispatch.recipient_type}: ${dispatch.recipient_name}`,
          changes: { quantity: { from: oldQty, to: item.quantity } },
        },
      ];
      await this.itemRepo.save(item);
    }
  }

  async update(id: string, dto: UpdateDispatchDto): Promise<InvDispatch> {
    const entity = await this.findOne(id);
    const updated = this.repo.merge(entity, dto);
    return await this.repo.save(updated);
  }

  async findAll() {
    return await this.repo.find({ order: { createdAt: 'DESC' } });
  }

  async findOne(id: string): Promise<InvDispatch> {
    const entity = await this.repo.findOneBy({ id });
    if (!entity) throw new NotFoundException(`Dispatch ${id} not found`);
    return entity;
  }

  async remove(id: string): Promise<void> {
    const result = await this.repo.delete(id);
    if (result.affected === 0) throw new NotFoundException(`Dispatch ${id} not found`);
  }
}

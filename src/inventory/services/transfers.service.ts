import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InvTransfer } from '../entities/inv_transfer.entity';
import { InvItem } from '../entities/inv_item.entity';
import { CreateTransferDto } from '../dto/transfer/create-transfer.dto';
import { UpdateTransferDto } from '../dto/transfer/update-transfer.dto';

@Injectable()
export class TransfersService {
  constructor(
    @InjectRepository(InvTransfer)
    private readonly repo: Repository<InvTransfer>,
    @InjectRepository(InvItem)
    private readonly itemRepo: Repository<InvItem>,
  ) {}

  async create(dto: CreateTransferDto): Promise<InvTransfer> {
    const entity = this.repo.create({
      transfer_type:       dto.transfer_type       ?? 'outbound',
      from_warehouse_id:   dto.from_warehouse_id   ?? undefined,
      from_warehouse_name: dto.from_warehouse_name  ?? undefined,
      to_warehouse_id:     dto.to_warehouse_id     ?? undefined,
      to_warehouse_name:   dto.to_warehouse_name    ?? undefined,
      items:               dto.items               ?? [],
      notes:               dto.notes               ?? undefined,
      return_reason:       dto.return_reason        ?? undefined,
      requested_by:        dto.requested_by         ?? undefined,
      status:              'PENDING',
      requested_at:        new Date(),
    });
    return await this.repo.save(entity);
  }

  async findAll() {
    return await this.repo.find({ order: { createdAt: 'DESC' } });
  }

  async findOne(id: string): Promise<InvTransfer> {
    const entity = await this.repo.findOneBy({ id });
    if (!entity) throw new NotFoundException(`Transfer ${id} not found`);
    return entity;
  }

  async updateStatus(id: string, dto: UpdateTransferDto): Promise<InvTransfer> {
    const entity = await this.findOne(id);
    const now = new Date();

    if (dto.status === 'IN_TRANSIT') {
      entity.sent_at = now;
      // Deduct items from source warehouse when physically sent
      await this.adjustInventory(entity, 'deduct_source', dto.sent_by);
    } else if (dto.status === 'CONFIRMED') {
      entity.confirmed_at = now;
      // Add items to destination warehouse when received
      await this.adjustInventory(entity, 'add_destination', dto.confirmed_by);
    } else if (dto.status === 'REJECTED') {
      entity.rejected_at = now;
      // Items never arrived — restore to source warehouse
      await this.adjustInventory(entity, 'restore_source', dto.rejected_by);
    } else if (dto.status === 'CANCELLED') {
      entity.cancelled_at = now;
      // CANCELLED from PENDING — nothing was sent yet, no inventory change
    }

    const updated = this.repo.merge(entity, dto);
    return await this.repo.save(updated);
  }

  // ── Inventory adjustment helper ─────────────────────────────────────────────
  private async adjustInventory(
    transfer: InvTransfer,
    action: 'deduct_source' | 'add_destination' | 'restore_source',
    by?: Record<string, any>,
  ): Promise<void> {
    if (!transfer.items?.length) return;

    for (const ti of transfer.items) {
      const qty = Number(ti.quantity || 0);
      if (!qty) continue;

      const now = new Date().toISOString();
      const transferRef = transfer.id.slice(0, 8).toUpperCase();
      const actor = (by && (by.fullName || by.employee_number)) ? by : null;

      if (action === 'deduct_source' || action === 'restore_source') {
        if (!ti.item_id) continue;
        const src = await this.itemRepo.findOneBy({ id: ti.item_id });
        if (!src) continue;
        const oldQty = src.quantity;
        src.quantity = Math.max(0,
          action === 'deduct_source' ? src.quantity - qty : src.quantity + qty
        );
        src.history = [
          ...(src.history ?? []),
          {
            at:            now,
            by:            actor,
            action:        'transferred',
            transfer_ref:  transferRef,
            transfer_from: transfer.from_warehouse_name,
            transfer_to:   transfer.to_warehouse_name,
            changes: { quantity: { from: oldQty, to: src.quantity } },
          },
        ];
        await this.itemRepo.save(src);

      } else if (action === 'add_destination') {
        if (!transfer.to_warehouse_id) continue;
        try {
          const dest = await this.itemRepo.findOne({
            where: { product_name: ti.item_name, warehouse_id: transfer.to_warehouse_id },
          });
          if (dest) {
            const oldQty = dest.quantity;
            dest.quantity += qty;
            dest.history = [
              ...(dest.history ?? []),
              {
                at:            now,
                by:            actor,
                action:        'transferred',
                transfer_ref:  transferRef,
                transfer_from: transfer.from_warehouse_name,
                transfer_to:   transfer.to_warehouse_name,
                changes: { quantity: { from: oldQty, to: dest.quantity } },
              },
            ];
            await this.itemRepo.save(dest);
          } else {
            const src = ti.item_id ? await this.itemRepo.findOneBy({ id: ti.item_id }) : null;
            const newItem = Object.assign(new InvItem(), {
              product_name: String(ti.item_name ?? ''),
              sku:          String(src?.sku ?? ti.sku ?? ''),
              brand:        String(src?.brand ?? ''),
              model:        String(src?.model ?? ''),
              unit:         String(ti.unit ?? src?.unit ?? 'pcs'),
              condition:    String(src?.condition ?? 'Good'),
              min_stock:    Number(src?.min_stock ?? 0),
              warehouse_id: transfer.to_warehouse_id,
              quantity:     qty,
              is_active:    true,
              baja:         false,
              createdBy:    actor,
              history: [{
                at:            now,
                by:            actor,
                action:        'transferred',
                transfer_ref:  transferRef,
                transfer_from: transfer.from_warehouse_name,
                transfer_to:   transfer.to_warehouse_name,
                changes: { quantity: { from: 0, to: qty } },
              }],
            });
            await this.itemRepo.save(newItem);
          }
        } catch (err) {
          console.error('[Inventory] add_destination ERROR:', err);
        }
      }
    }
  }

  async remove(id: string): Promise<void> {
    const result = await this.repo.delete(id);
    if (result.affected === 0) throw new NotFoundException(`Transfer ${id} not found`);
  }
}

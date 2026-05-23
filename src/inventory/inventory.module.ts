import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { InvWarehouse } from './entities/inv_warehouse.entity';
import { InvItem } from './entities/inv_item.entity';
import { InvTransfer } from './entities/inv_transfer.entity';
import { InvDispatch } from './entities/inv_dispatch.entity';

import { WarehousesController } from './controllers/warehouses.controller';
import { ItemsController } from './controllers/items.controller';
import { TransfersController } from './controllers/transfers.controller';
import { DispatchesController } from './controllers/dispatches.controller';

import { WarehousesService } from './services/warehouses.service';
import { ItemsService } from './services/items.service';
import { TransfersService } from './services/transfers.service';
import { DispatchesService } from './services/dispatches.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([InvWarehouse, InvItem, InvTransfer, InvDispatch]),
  ],
  controllers: [
    WarehousesController,
    ItemsController,
    TransfersController,
    DispatchesController,
  ],
  providers: [
    WarehousesService,
    ItemsService,
    TransfersService,
    DispatchesService,
  ],
})
export class InventoryModule {}

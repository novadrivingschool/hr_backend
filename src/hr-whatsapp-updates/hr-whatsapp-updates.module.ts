import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MulterModule } from '@nestjs/platform-express';
import { HrWhatsappUpdate } from './entities/hr-whatsapp-update.entity';
import { HrWhatsappUpdateStatusHistory } from './entities/hr-whatsapp-update-status-history.entity';
import { HrWhatsappUpdateComment } from './entities/hr-whatsapp-update-comment.entity';
import { HrWhatsappUpdatesService } from './hr-whatsapp-updates.service';
import { HrWhatsappUpdatesController } from './hr-whatsapp-updates.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([HrWhatsappUpdate, HrWhatsappUpdateStatusHistory, HrWhatsappUpdateComment]),
    MulterModule.register({ limits: { fileSize: 20 * 1024 * 1024 } }),
  ],
  controllers: [HrWhatsappUpdatesController],
  providers: [HrWhatsappUpdatesService],
})
export class HrWhatsappUpdatesModule {}

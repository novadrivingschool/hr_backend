import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AgreementService } from './agreement.service';
import { AgreementController } from './agreement.controller';
import { Agreement } from './entities/agreement.entity';

@Module({
  controllers: [AgreementController],
  providers: [AgreementService],
  imports: [TypeOrmModule.forFeature([Agreement])],
})
export class AgreementModule {}

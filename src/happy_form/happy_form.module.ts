import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HappyFormService } from './happy_form.service';
import { HappyFormController } from './happy_form.controller';
import { HappyForm } from './entities/happy_form.entity';

@Module({
  imports: [TypeOrmModule.forFeature([HappyForm])],
  controllers: [HappyFormController],
  providers: [HappyFormService],
  exports: [HappyFormService],
})
export class HappyFormModule {}
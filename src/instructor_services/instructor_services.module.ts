import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InstructorServicesService } from './instructor_services.service';
import { InstructorServicesController } from './instructor_services.controller';
import { InstructorService } from './entities/instructor_service.entity';

@Module({
  imports: [TypeOrmModule.forFeature([InstructorService])],
  controllers: [InstructorServicesController],
  providers: [InstructorServicesService],
})
export class InstructorServicesModule {}
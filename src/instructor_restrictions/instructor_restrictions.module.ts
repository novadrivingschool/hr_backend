import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InstructorRestrictionsService } from './instructor_restrictions.service';
import { InstructorRestrictionsController } from './instructor_restrictions.controller';
import { InstructorRestriction } from './entities/instructor_restriction.entity';

@Module({
  imports: [TypeOrmModule.forFeature([InstructorRestriction])],
  controllers: [InstructorRestrictionsController],
  providers: [InstructorRestrictionsService],
})
export class InstructorRestrictionsModule {}
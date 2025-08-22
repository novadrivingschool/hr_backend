import { Module } from '@nestjs/common';
import { TypeOfStaffService } from './type_of_staff.service';
import { TypeOfStaffController } from './type_of_staff.controller';
import { TypeOfStaff } from './entities/type_of_staff.entity';
import { TypeOrmModule } from '@nestjs/typeorm';

@Module({
  controllers: [TypeOfStaffController],
  providers: [TypeOfStaffService],
  imports: [TypeOrmModule.forFeature([TypeOfStaff])],
})
export class TypeOfStaffModule {}

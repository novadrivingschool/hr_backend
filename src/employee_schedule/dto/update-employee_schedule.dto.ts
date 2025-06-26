import { PartialType } from '@nestjs/mapped-types';
import { CreateEmployeeScheduleDto } from './create-employee_schedule.dto';

export class UpdateEmployeeScheduleDto extends PartialType(CreateEmployeeScheduleDto) {}

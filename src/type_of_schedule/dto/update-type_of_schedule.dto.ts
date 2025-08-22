import { PartialType } from '@nestjs/mapped-types';
import { CreateTypeOfScheduleDto } from './create-type_of_schedule.dto';

export class UpdateTypeOfScheduleDto extends PartialType(CreateTypeOfScheduleDto) {}

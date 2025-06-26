import { PartialType } from '@nestjs/mapped-types';
import { CreateFixedScheduleDto } from './create-fixed_schedule.dto';

export class UpdateFixedScheduleDto extends PartialType(CreateFixedScheduleDto) {}

import { PartialType } from '@nestjs/mapped-types';
import { CreateScheduleEventDto } from './create-schedule_event.dto';

export class UpdateScheduleEventDto extends PartialType(CreateScheduleEventDto) {}

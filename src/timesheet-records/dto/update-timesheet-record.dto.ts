import { PartialType } from '@nestjs/mapped-types';
import { CreateTimesheetRecordDto } from './create-timesheet-record.dto';

export class UpdateTimesheetRecordDto extends PartialType(CreateTimesheetRecordDto) {}

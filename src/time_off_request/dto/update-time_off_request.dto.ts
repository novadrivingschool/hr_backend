import { PartialType } from '@nestjs/mapped-types';
import { CreateTimeOffRequestDto } from './create-time_off_request.dto';

export class UpdateTimeOffRequestDto extends PartialType(CreateTimeOffRequestDto) {}

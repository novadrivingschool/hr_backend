import { PartialType } from '@nestjs/mapped-types';
import { CreateActivityRequestDto } from './create-activity_request.dto';

export class UpdateActivityRequestDto extends PartialType(CreateActivityRequestDto) {}

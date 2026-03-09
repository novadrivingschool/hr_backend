import { PartialType } from '@nestjs/mapped-types';
import { CreateICareReasonDto } from './create-i_care_reason.dto';

export class UpdateICareReasonDto extends PartialType(CreateICareReasonDto) {}

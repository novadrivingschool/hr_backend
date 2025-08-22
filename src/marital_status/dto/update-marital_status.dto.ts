import { PartialType } from '@nestjs/mapped-types';
import { CreateMaritalStatusDto } from './create-marital_status.dto';

export class UpdateMaritalStatusDto extends PartialType(CreateMaritalStatusDto) {}

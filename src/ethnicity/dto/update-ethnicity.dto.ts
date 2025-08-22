import { PartialType } from '@nestjs/mapped-types';
import { CreateEthnicityDto } from './create-ethnicity.dto';

export class UpdateEthnicityDto extends PartialType(CreateEthnicityDto) {}

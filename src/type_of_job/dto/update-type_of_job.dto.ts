import { PartialType } from '@nestjs/mapped-types';
import { CreateTypeOfJobDto } from './create-type_of_job.dto';

export class UpdateTypeOfJobDto extends PartialType(CreateTypeOfJobDto) {}

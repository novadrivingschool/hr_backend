import { PartialType } from '@nestjs/mapped-types';
import { CreateHumanResourceDto } from './create-human_resource.dto';

export class UpdateHumanResourceDto extends PartialType(CreateHumanResourceDto) {}

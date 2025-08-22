import { PartialType } from '@nestjs/mapped-types';
import { CreateWorkerCategoryDto } from './create-worker_category.dto';

export class UpdateWorkerCategoryDto extends PartialType(CreateWorkerCategoryDto) {}

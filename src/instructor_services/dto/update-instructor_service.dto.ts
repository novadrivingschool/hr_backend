import { PartialType } from '@nestjs/mapped-types';
import { CreateInstructorServiceDto } from './create-instructor_service.dto';

export class UpdateInstructorServiceDto extends PartialType(CreateInstructorServiceDto) {}

import { PartialType } from '@nestjs/mapped-types';
import { CreateInstructorRestrictionDto } from './create-instructor_restriction.dto';

export class UpdateInstructorRestrictionDto extends PartialType(CreateInstructorRestrictionDto) {}

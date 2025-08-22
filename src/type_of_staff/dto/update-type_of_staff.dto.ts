import { PartialType } from '@nestjs/mapped-types';
import { CreateTypeOfStaffDto } from './create-type_of_staff.dto';

export class UpdateTypeOfStaffDto extends PartialType(CreateTypeOfStaffDto) {}

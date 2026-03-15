import { PartialType } from '@nestjs/mapped-types';
import { CreateEmployeeAccountingDto } from './create-employee-accounting.dto';

export class UpdateEmployeeAccountingDto extends PartialType(CreateEmployeeAccountingDto) {}

import { PartialType } from '@nestjs/mapped-types';
import { CreateICareDto } from './create-i-care.dto';

export class UpdateICareDto extends PartialType(CreateICareDto) {}
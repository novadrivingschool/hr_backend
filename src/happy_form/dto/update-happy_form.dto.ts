import { PartialType } from '@nestjs/mapped-types';
import { CreateHappyFormDto } from './create-happy_form.dto';

export class UpdateHappyFormDto extends PartialType(CreateHappyFormDto) {}

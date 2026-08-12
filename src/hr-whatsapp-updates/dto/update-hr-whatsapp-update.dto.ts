import { PartialType } from '@nestjs/mapped-types';
import { CreateHrWhatsappUpdateDto } from './create-hr-whatsapp-update.dto';

export class UpdateHrWhatsappUpdateDto extends PartialType(CreateHrWhatsappUpdateDto) {}

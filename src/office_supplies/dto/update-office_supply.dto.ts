import { PartialType } from '@nestjs/mapped-types'
import { IsOptional, IsString, Length } from 'class-validator'
import { CreateOfficeSupplyDto } from './create-office_supply.dto'

export class UpdateOfficeSupplyDto extends PartialType(CreateOfficeSupplyDto) {
  // Bloqueamos explícitamente cambios a requester (aunque llegue en body)
  @IsOptional()
  @IsString()
  requester?: never
}

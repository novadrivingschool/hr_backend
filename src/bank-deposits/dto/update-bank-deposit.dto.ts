import { PartialType } from '@nestjs/mapped-types'
import { CreateBankDepositDto } from './create-bank-deposit.dto'

export class UpdateBankDepositDto extends PartialType(CreateBankDepositDto) {}

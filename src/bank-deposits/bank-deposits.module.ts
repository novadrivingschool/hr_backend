import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { BankDeposit } from './entities/bank-deposit.entity'
import { BankDepositsService } from './bank-deposits.service'
import { BankDepositsController } from './bank-deposits.controller'

@Module({
  imports: [TypeOrmModule.forFeature([BankDeposit])],
  controllers: [BankDepositsController],
  providers: [BankDepositsService],
})
export class BankDepositsModule {}

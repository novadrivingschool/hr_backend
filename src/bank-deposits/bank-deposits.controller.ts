import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
} from '@nestjs/common'
import { BankDepositsService } from './bank-deposits.service'
import { CreateBankDepositDto } from './dto/create-bank-deposit.dto'
import { UpdateBankDepositDto } from './dto/update-bank-deposit.dto'
import { UpdateAccountingStatusDto } from './dto/update-accounting-status.dto'
import { QueryBankDepositDto } from './dto/query-bank-deposit.dto'

@Controller('bank-deposits')
export class BankDepositsController {
  constructor(private readonly service: BankDepositsService) {}

  @Post()
  create(@Body() dto: CreateBankDepositDto) {
    return this.service.create(dto)
  }

  @Get()
  findAll(@Query() query: QueryBankDepositDto) {
    return this.service.findAll(query)
  }

  @Get('employee/:employee_number')
  findByEmployee(
    @Param('employee_number') employee_number: string,
    @Query() query: QueryBankDepositDto,
  ) {
    return this.service.findByEmployee(employee_number, query)
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id)
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateBankDepositDto) {
    return this.service.update(id, dto)
  }

  @Patch(':id/accounting-status')
  updateAccountingStatus(
    @Param('id') id: string,
    @Body() dto: UpdateAccountingStatusDto,
  ) {
    return this.service.updateAccountingStatus(id, dto)
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id)
  }
}

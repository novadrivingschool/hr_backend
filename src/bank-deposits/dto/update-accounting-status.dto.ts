import { IsString, IsNotEmpty, IsOptional, IsEnum, IsArray } from 'class-validator'
import { DepositStatus } from '../entities/bank-deposit.entity'

export class UpdateAccountingStatusDto {
  @IsNotEmpty()
  @IsEnum(DepositStatus)
  status: DepositStatus

  @IsString() @IsNotEmpty()
  accounting_comments: string

  @IsString() @IsNotEmpty()
  accounting_employee_number: string

  @IsString() @IsNotEmpty()
  accounting_fullName: string

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  accounting_files?: string[]
}

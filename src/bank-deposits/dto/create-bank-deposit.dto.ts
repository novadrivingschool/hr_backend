import { IsString, IsNotEmpty, IsOptional, IsArray, IsNumberString, IsDecimal } from 'class-validator'

export class CreateBankDepositDto {
  @IsString() @IsNotEmpty()
  location: string

  @IsString() @IsNotEmpty()
  date: string

  @IsNotEmpty()
  amount: number

  @IsOptional()
  @IsString()
  receipt_number?: string

  @IsOptional()
  @IsString()
  notes?: string

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  files?: string[]

  @IsString() @IsNotEmpty()
  fullName: string

  @IsString() @IsNotEmpty()
  employee_number: string
}

import { IsOptional, IsString, IsNumberString } from 'class-validator'

export class QueryBankDepositDto {
  @IsOptional() @IsString()
  search?: string

  @IsOptional() @IsString()
  location?: string

  @IsOptional() @IsString()
  employee_number?: string

  @IsOptional() @IsString()
  date_from?: string

  @IsOptional() @IsString()
  date_to?: string

  @IsOptional() @IsNumberString()
  page?: number

  @IsOptional() @IsNumberString()
  limit?: number
}

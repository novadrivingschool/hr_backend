import {
  IsArray, IsDateString, IsEnum, IsObject, IsOptional, IsString, IsUrl, Length
} from 'class-validator'
import { SupplyStatus } from '../entities/office_supply.entity'

export class CreateOfficeSupplyDto {
  @IsDateString()
  requestDate!: string   // el front ya lo envía (yyyy-mm-dd)

  @IsString()
  @Length(1, 160)
  requester!: string     // ⬅️ AHORA OBLIGATORIO desde el body (name + last_name)

  @IsOptional()
  @IsString()
  requesterEmployeeNumber?: string | null

  @IsString()
  @Length(1, 120)
  location!: string

  @IsOptional() @IsObject()
  office?: Record<string, number>

  @IsOptional() @IsObject()
  cleaning?: Record<string, number>

  @IsOptional() @IsObject()
  desk?: Record<string, number>

  @IsOptional() @IsObject()
  kitchen?: Record<string, number>

  @IsOptional() @IsString()
  otherKitchenItems?: string | null

  @IsOptional() @IsString()
  observations?: string | null

  // ✅ NUEVO
  @IsOptional()
  @IsEnum(SupplyStatus)
  status?: SupplyStatus

  // ✅ NUEVO
  @IsOptional()
  @IsArray()
  @IsUrl({}, { each: true })
  links?: string[]

  // ✅ NUEVO
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  attachments?: string[]

  @IsOptional() @IsString()
  notes?: string | null

  @IsOptional() @IsString()
  employee_number?: string | null

}

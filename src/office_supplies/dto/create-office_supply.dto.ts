import {
  IsDateString, IsObject, IsOptional, IsString, Length
} from 'class-validator'

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
}

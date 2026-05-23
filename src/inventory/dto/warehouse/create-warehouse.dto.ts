import { IsString, IsNotEmpty, IsOptional, IsBoolean, Length, IsIn } from 'class-validator';

export class CreateWarehouseDto {
  @IsString()
  @IsNotEmpty()
  @Length(1, 120)
  name: string;

  @IsOptional()
  @IsIn(['location', 'department'])
  type?: string;

  @IsOptional()
  @IsString()
  @Length(0, 20)
  code?: string;

  @IsOptional()
  @IsString()
  @Length(0, 160)
  manager?: string;

  @IsOptional()
  @IsString()
  @Length(0, 255)
  address?: string;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}

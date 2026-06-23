// dto/add-seguimiento-i-care.dto.ts
import { Type } from 'class-transformer';
import {
  IsArray, IsIn, IsObject, IsOptional, IsString,
  Matches, MaxLength, ValidateNested,
} from 'class-validator';

class EmployeeRefDto {
  @IsString() name: string;
  @IsString() last_name: string;
  @IsString() employee_number: string;
  @IsString() nova_email: string;
}

/**
 * DTO para agregar un seguimiento adicional (o actualizar el actual_date del último).
 * También se usa cuando el coordinator quiere registrar que ya se cumplió un seguimiento
 * y asigna el siguiente.
 */
export class AddSeguimientoICareDto {
  @IsObject()
  @ValidateNested()
  @Type(() => EmployeeRefDto)
  added_by: EmployeeRefDto;

  /** Nueva fecha de seguimiento programada (YYYY-MM-DD) */
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'scheduled_date must be in YYYY-MM-DD format',
  })
  scheduled_date: string;

  /** Fecha real en que se revisó el seguimiento anterior (YYYY-MM-DD) */
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'actual_date must be in YYYY-MM-DD format',
  })
  actual_date?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  attachments?: string[];

  /** Rol del que llama — usado para guardar el check de high/critical */
  @IsOptional()
  @IsIn(['coordinator', 'coordinator-assistant', 'hr', 'hr-assistant', 'management', 'super-coordinator'])
  caller_role?: string;
}

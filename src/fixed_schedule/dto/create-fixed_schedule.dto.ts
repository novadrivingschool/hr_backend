/* src\fixed_schedule\dto\create-fixed_schedule.dto.ts */
import { IsOptional, IsString, ValidateIf } from 'class-validator';

export class CreateFixedScheduleDto {
  @IsOptional()
  @ValidateIf(o => o.end_date !== null)
  @IsString()
  end_date?: string | null;
}

import { IsOptional, IsString, Matches } from 'class-validator';

export class QueryWeeklyKpisDto {
  /** Cualquier fecha dentro de la semana deseada (YYYY-MM-DD). El service
   * calcula el lunes de esa semana como inicio. Si se omite, usa la semana
   * actual (hoy). */
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'weekStart debe tener el formato YYYY-MM-DD',
  })
  weekStart?: string;
}

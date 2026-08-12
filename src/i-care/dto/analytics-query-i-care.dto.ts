// dto/analytics-query-i-care.dto.ts
import { IsIn, IsOptional, Matches } from 'class-validator';

export const ICARE_ANALYTICS_BUCKETS = ['day', 'week', 'month'] as const;
export type ICareAnalyticsBucket = (typeof ICARE_ANALYTICS_BUCKETS)[number];

/**
 * Query params for GET /i-care/analytics.
 *
 * `from` / `to` are calendar dates (YYYY-MM-DD, inclusive) filtered on the
 * report's `date` column (business date, same field the rest of the module
 * uses for date-range filtering — see ICareService.getStatistics()). When
 * omitted the whole history is analysed.
 *
 * `bucket` controls the granularity of the created/solved trend series. When
 * omitted the service picks one automatically from the range length.
 *
 * `department` / `staffPositions` scope the analytics the same way the
 * records table does for restricted coordinators — comma-separated values.
 */
export class ICareAnalyticsQueryDto {
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'from must be YYYY-MM-DD' })
  from?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'to must be YYYY-MM-DD' })
  to?: string;

  @IsOptional()
  @IsIn(ICARE_ANALYTICS_BUCKETS as unknown as string[])
  bucket?: ICareAnalyticsBucket;

  @IsOptional()
  department?: string;

  @IsOptional()
  staffPositions?: string;
}

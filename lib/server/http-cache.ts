import { NextResponse } from 'next/server.js'

export type CacheTier = 'fast' | 'medium' | 'slow' | 'static'
export type DataSourceHeader = 'memory' | 'redis' | 'fresh' | 'stale' | 'none'

const CACHE_CONTROL_BY_TIER: Record<CacheTier, string> = {
  fast: 'public, s-maxage=3600, stale-while-revalidate=60, stale-if-error=600',
  medium: 'public, s-maxage=3600, stale-while-revalidate=120, stale-if-error=900',
  slow: 'public, s-maxage=3600, stale-while-revalidate=300, stale-if-error=3600',
  static: 'public, s-maxage=86400, stale-while-revalidate=600, stale-if-error=14400',
}

export function cacheControlForTier(tier: CacheTier): string {
  return CACHE_CONTROL_BY_TIER[tier]
}

export function buildCacheHeaders(
  tier: CacheTier,
  dataSource: DataSourceHeader,
): Record<string, string> {
  return {
    'Cache-Control': cacheControlForTier(tier),
    'X-Cache-Tier': tier,
    'X-Data-Source': dataSource,
  }
}

export function sectionJsonResponse<T>(
  body: T,
  tier: CacheTier,
  dataSource: DataSourceHeader,
) {
  return NextResponse.json(body, {
    headers: buildCacheHeaders(tier, dataSource),
  })
}

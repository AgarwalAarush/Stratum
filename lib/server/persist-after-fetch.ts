import type { SectionData } from '@/lib/types'
import type { CachedFetchResult } from '@/lib/server/cache'
import { persistFeedItems } from '@/lib/data/overview-persistence'

export function persistIfFresh(
  scope: string,
  section: string,
  result: CachedFetchResult<SectionData>,
): void {
  if (result.source === 'fresh' && result.data && result.data.items.length > 0) {
    void persistFeedItems(scope, section, result.data.items)
  }
}

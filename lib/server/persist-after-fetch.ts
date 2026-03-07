import type { SectionData } from '../types.ts'
import type { CachedFetchResult } from './cache.ts'
import { persistFeedItems } from '../data/overview-persistence.ts'

export function persistIfFresh(
  scope: string,
  section: string,
  result: CachedFetchResult<SectionData>,
): void {
  if (result.source === 'fresh' && result.data && result.data.items.length > 0) {
    void persistFeedItems(scope, section, result.data.items)
  }
}

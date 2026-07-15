import test from 'node:test'
import assert from 'node:assert/strict'

import { mergeMarketNews } from '../lib/markets/news.ts'
import type { NewsItem } from '../lib/types.ts'

function item(id: string, title: string, publishedAt: string): NewsItem {
  return { type: 'news', id, title, source: 'Test', category: 'Markets', publishedAt, url: `https://example.com/${id}` }
}

test('market news merge sorts across feeds and respects its cap', () => {
  const result = mergeMarketNews([
    [item('old', 'Older signal', '2026-07-14T12:00:00Z')],
    [item('new', 'Newer signal', '2026-07-15T12:00:00Z')],
  ], 1)
  assert.deepEqual(result.map((entry) => entry.id), ['new'])
})

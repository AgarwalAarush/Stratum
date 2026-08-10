import test from 'node:test'
import assert from 'node:assert/strict'

import { selectMarketBriefNews } from '../lib/markets/brief-news.ts'
import type { NewsItem } from '../lib/types.ts'

const item = (overrides: Partial<NewsItem>): NewsItem => ({
  type: 'news',
  id: overrides.id ?? 'item',
  title: overrides.title ?? 'Market update',
  source: overrides.source ?? 'Reuters',
  category: overrides.category ?? 'Macro',
  publishedAt: overrides.publishedAt ?? '2026-08-10T18:00:00.000Z',
  url: overrides.url ?? `https://example.com/${overrides.id ?? 'item'}`,
  ...overrides,
})

test('market brief news promotes relevant and macro context while excluding solicitation noise', () => {
  const news = selectMarketBriefNews([
    item({ id: 'legal', title: 'Law firm encourages investors to join class action', category: 'Stock News' }),
    item({ id: 'commentary', title: "Trump's Cherry-Picked Inflation Boast", category: 'Inflation' }),
    item({ id: 'filing', title: 'ACME filed 10-Q', category: 'SEC 10-Q', publishedAt: '2026-08-10T20:00:00.000Z' }),
    item({ id: 'macro', title: 'Inflation report shifts rate outlook', category: 'Inflation', publishedAt: '2026-08-10T17:00:00.000Z' }),
    item({ id: 'tracked', title: 'COHR announces results and outlook', topic: 'company:COHR', category: 'Stock News', source: 'Company release', publishedAt: '2026-08-10T16:00:00.000Z' }),
  ], ['COHR'])

  assert.deepEqual(news.map((entry) => entry.id), ['tracked', 'macro'])
})

test('market brief news retains a routine filing when it concerns a tracked name', () => {
  const news = selectMarketBriefNews([
    item({ id: 'tracked-filing', title: 'COHR filed 10-Q', topic: 'company:COHR', category: 'SEC 10-Q' }),
  ], ['COHR'])

  assert.equal(news[0]?.id, 'tracked-filing')
})

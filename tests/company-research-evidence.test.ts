import test from 'node:test'
import assert from 'node:assert/strict'

import {
  collectCompanyResearchEvidence,
  companyResearchQueries,
} from '../lib/server/company-research-evidence.ts'
import type { ParsedFeedItem } from '../lib/data/rss-parser.ts'

const items: ParsedFeedItem[] = [
  {
    id: 'one',
    source: 'Company research 1',
    title: 'Planet launches an AI product for customers',
    link: 'https://news.google.com/rss/articles/one',
    publisher: 'Planet',
    publishedAt: Date.parse('2026-07-30T00:00:00Z'),
  },
  {
    id: 'two',
    source: 'Company research 2',
    title: 'Planet wins a multi-year government contract',
    link: 'https://news.google.com/rss/articles/two',
    publisher: 'Reuters',
    publishedAt: Date.parse('2026-07-29T00:00:00Z'),
  },
  {
    id: 'three',
    source: 'Company research 3',
    title: 'Planet faces competition in earth observation',
    link: 'https://news.google.com/rss/articles/three',
    publisher: 'Industry publication',
    publishedAt: Date.parse('2026-07-28T00:00:00Z'),
  },
]

test('company research queries deliberately cover product, market environment, and strategic relationships', () => {
  assert.deepEqual(companyResearchQueries('Planet Labs PBC', 'PL'), [
    '"Planet Labs" PL products customers adoption business model',
    '"Planet Labs" PL growth contracts backlog pricing unit economics',
    '"Planet Labs" PL capacity deployment technology product roadmap',
    '"Planet Labs" PL market demand competition substitutes TAM',
    '"Planet Labs" PL policy regulation macro supply chain environment',
    '"Planet Labs" PL strategic relationship ecosystem platform',
    '"Planet Labs" PL affiliates related party acquisitions merger',
    '"Planet Labs" PL shared infrastructure customers suppliers partnerships',
  ])
})

test('research evidence keeps source provenance and remains resilient to an individual scrape failure', async () => {
  const evidence = await collectCompanyResearchEvidence('Planet Labs PBC', 'PL', 'https://www.planet.com', {
    collect: async (feeds) => {
      assert.equal(feeds.length, 8)
      assert.match(feeds[3]!.url, /market%20demand%20competition%20substitutes%20TAM/)
      return items
    },
    resolveGoogleNewsUrl: async (url) => url.replace('https://news.google.com/rss/articles/', 'https://www.planet.com/research/'),
    scrape: async (url) => {
      if (url.endsWith('/three')) throw new Error('blocked')
      return {
        title: url.endsWith('/one') ? 'Planetary intelligence launch' : 'Government demand report',
        url,
        content: url.endsWith('/one')
          ? 'Planet describes a new artificial intelligence product and its intended customer workflow.'
          : 'A multi-year contract could support growth, subject to delivery and renewal.',
      }
    },
    now: new Date('2026-08-01T00:00:00Z'),
  })

  assert.equal(evidence.length, 3)
  assert.equal(evidence[0]!.quality, 'primary')
  assert.equal(evidence[0]!.kind, 'ai_and_product')
  assert.equal(evidence[0]!.source, 'Planet')
  assert.equal(evidence[2]!.excerpt, null)
  assert.equal(evidence[2]!.quality, 'primary')
})

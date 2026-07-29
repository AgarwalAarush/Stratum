import test from 'node:test'
import assert from 'node:assert/strict'

import {
  fetchFmpMarketIntelligence,
  normalizeFmpNewsRows,
  normalizeFmpSecFilingRows,
} from '../lib/data/fmp-intelligence.ts'
import { readFile } from 'node:fs/promises'

test('FMP news and press releases normalize without retaining provider credentials', () => {
  const items = normalizeFmpNewsRows([
    {
      symbol: 'AAPL',
      publishedDate: '2026-07-28T14:30:00Z',
      publisher: 'Example Wire',
      title: 'Apple announces a new product',
      url: 'https://example.com/apple-product',
      text: 'Long provider body that is intentionally not persisted.',
    },
  ], 'Stock News')

  assert.equal(items.length, 1)
  assert.equal(items[0]?.source, 'Example Wire')
  assert.equal(items[0]?.category, 'Stock News · AAPL')
  assert.equal(items[0]?.topic, 'company:AAPL')
  assert.equal('text' in (items[0] ?? {}), false)
  assert.doesNotMatch(JSON.stringify(items), /api[_-]?key/i)
})

test('FMP SEC filings normalize to direct EDGAR evidence links', () => {
  const items = normalizeFmpSecFilingRows([
    {
      symbol: 'MSFT',
      cik: '0000789019',
      acceptedDate: '2026-07-28T16:12:34Z',
      formType: '8-K',
      link: 'https://www.sec.gov/Archives/example-index.htm',
      finalLink: 'https://www.sec.gov/Archives/example.htm',
    },
  ])

  assert.equal(items.length, 1)
  assert.equal(items[0]?.title, 'MSFT filed 8-K')
  assert.equal(items[0]?.category, 'SEC 8-K')
  assert.equal(items[0]?.url, 'https://www.sec.gov/Archives/example.htm')
})

test('FMP intelligence fetch tolerates plan-gated sources and reports diagnostics', async () => {
  const requestedUrls: string[] = []
  const fetchImpl = (async (input: RequestInfo | URL) => {
    const url = String(input)
    requestedUrls.push(url)

    if (url.includes('/news/stock-latest')) {
      const item = {
        symbol: 'NVDA',
        publishedDate: '2026-07-28T18:00:00Z',
        publisher: 'Example News',
        title: 'NVIDIA update',
        url: 'https://example.com/nvda',
      }
      return Response.json([item, item])
    }
    if (url.includes('/news/press-releases-latest')) {
      return new Response('Payment Required', { status: 402 })
    }
    return Response.json([{
      symbol: 'NVDA',
      filingDate: '2026-07-28',
      formType: '10-Q',
      finalLink: 'https://www.sec.gov/Archives/nvda-10q.htm',
    }])
  }) as typeof fetch

  const batch = await fetchFmpMarketIntelligence({
    apiKey: 'secret-test-key',
    fetchImpl,
    now: new Date('2026-07-28T20:00:00Z'),
  })

  assert.equal(batch.itemCount, 2)
  assert.equal(batch.sections.find((section) => section.section === 'fmp-press-releases')?.itemCount, 0)
  assert.match(batch.sections.find((section) => section.section === 'fmp-press-releases')?.error ?? '', /402/)
  assert.ok(requestedUrls.every((url) => url.startsWith('https://financialmodelingprep.com/stable/')))
  assert.ok(requestedUrls.every((url) => url.includes('apikey=secret-test-key')))
})

test('feed persistence deduplicates an upsert batch by its database conflict key', async () => {
  const source = await readFile(new URL('../lib/data/overview-persistence.ts', import.meta.url), 'utf8')
  assert.match(source, /new Map\(normalizedRows\.map/)
  assert.match(source, /row\.item_type.*row\.url/s)
})

import test from 'node:test'
import assert from 'node:assert/strict'

import { normalizeHackerNewsItem } from '../lib/data/discussions.ts'
import { normalizeTrendingRepo } from '../lib/data/repos.ts'
import { parseFeedXml } from '../lib/data/rss-parser.ts'
import { parseArxivEntry } from '../lib/data/arxiv.ts'
import { cachedFetchWithFallback, clearCacheForTests } from '../lib/server/cache.ts'

test('normalizeHackerNewsItem maps HN payload to DiscussionItem', () => {
  const normalized = normalizeHackerNewsItem({
    id: 123,
    type: 'story',
    title: 'Show HN: Example',
    url: 'https://example.com',
    score: 42,
    descendants: 11,
    time: 1_700_000_000,
  })

  assert.ok(normalized)
  assert.equal(normalized?.type, 'discussion')
  assert.equal(normalized?.id, 'hn-123')
  assert.equal(normalized?.source, 'HN')
  assert.equal(normalized?.points, 42)
  assert.equal(normalized?.commentCount, 11)
  assert.equal(normalized?.url, 'https://example.com')
})

test('normalizeTrendingRepo handles primary and fallback trending schemas', () => {
  const primary = normalizeTrendingRepo({
    author: 'openai',
    name: 'example',
    description: 'Primary shape',
    language: 'TypeScript',
    stars: 500,
    currentPeriodStars: 25,
    url: 'https://github.com/openai/example',
  })
  const fallback = normalizeTrendingRepo({
    fullName: 'anthropic/demo',
    description: 'Fallback shape',
    language: 'Python',
    totalStars: 900,
    starsToday: 17,
  })

  assert.ok(primary)
  assert.equal(primary?.owner, 'openai')
  assert.equal(primary?.name, 'example')
  assert.equal(primary?.starsToday, 25)

  assert.ok(fallback)
  assert.equal(fallback?.owner, 'anthropic')
  assert.equal(fallback?.name, 'demo')
  assert.equal(fallback?.totalStars, 900)
  assert.equal(fallback?.starsToday, 17)
})

test('parseFeedXml extracts items from RSS and Atom payloads', () => {
  const rss = `
    <rss><channel>
      <item>
        <title><![CDATA[RSS Headline]]></title>
        <link>https://example.com/rss</link>
        <pubDate>Wed, 06 Mar 2026 10:00:00 GMT</pubDate>
      </item>
    </channel></rss>
  `
  const atom = `
    <feed xmlns="http://www.w3.org/2005/Atom">
      <entry>
        <title>Atom Headline</title>
        <link href="https://example.com/atom" />
        <updated>2026-03-06T09:00:00Z</updated>
      </entry>
    </feed>
  `

  const rssItems = parseFeedXml(rss, 'RSS Source')
  const atomItems = parseFeedXml(atom, 'Atom Source')

  assert.equal(rssItems.length, 1)
  assert.equal(atomItems.length, 1)
  assert.equal(rssItems[0]?.title, 'RSS Headline')
  assert.equal(atomItems[0]?.title, 'Atom Headline')
  assert.equal(atomItems[0]?.link, 'https://example.com/atom')
})

test('parseArxivEntry extracts a PaperItem from XML entry block', () => {
  const entry = `
    <entry>
      <id>http://arxiv.org/abs/2501.12948v1</id>
      <title> DeepSeek-R1: Reinforcement Learning for Reasoning </title>
      <published>2025-01-22T00:00:00Z</published>
      <author><name>Example Author</name></author>
      <author><name>Second Author</name></author>
      <category term="cs.AI" />
      <category term="cs.LG" />
      <link rel="alternate" type="text/html" href="https://arxiv.org/abs/2501.12948" />
    </entry>
  `

  const paper = parseArxivEntry(entry)
  assert.ok(paper)
  assert.equal(paper?.type, 'paper')
  assert.equal(paper?.id, 'arxiv-2501.12948')
  assert.equal(paper?.categories[0], 'cs.AI')
  assert.equal(paper?.url, 'https://arxiv.org/abs/2501.12948')
})

test('cachedFetchWithFallback coalesces in-flight requests', async () => {
  clearCacheForTests()
  let calls = 0

  const fetcher = async () => {
    calls += 1
    await new Promise((resolve) => setTimeout(resolve, 30))
    return { ok: true }
  }

  const [a, b] = await Promise.all([
    cachedFetchWithFallback({ key: 'coalesce', ttlSeconds: 60, fetcher }),
    cachedFetchWithFallback({ key: 'coalesce', ttlSeconds: 60, fetcher }),
  ])

  assert.equal(calls, 1)
  assert.deepEqual(a.data, { ok: true })
  assert.deepEqual(b.data, { ok: true })
})

test('cachedFetchWithFallback returns stale data on upstream failure', async () => {
  clearCacheForTests()

  const seeded = await cachedFetchWithFallback({
    key: 'stale-fallback',
    ttlSeconds: 0,
    fetcher: async () => ({ value: 'seed' }),
  })
  assert.deepEqual(seeded.data, { value: 'seed' })

  const stale = await cachedFetchWithFallback({
    key: 'stale-fallback',
    ttlSeconds: 60,
    fetcher: async () => {
      throw new Error('upstream down')
    },
  })

  assert.deepEqual(stale.data, { value: 'seed' })
  assert.equal(stale.source, 'stale')
})

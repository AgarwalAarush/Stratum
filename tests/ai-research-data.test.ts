import test from 'node:test'
import assert from 'node:assert/strict'

import { parseArxivEntry } from '../lib/data/arxiv.ts'
import { normalizeHackerNewsItem } from '../lib/data/discussions.ts'
import {
  fetchTrendingRepos,
  isEmergingRepoCandidate,
  normalizeGithubSearchRepo,
} from '../lib/data/repos.ts'
import { NEWS_TOPIC_FEEDS, NEWS_TOPICS, fetchNewsItemsByTopic } from '../lib/data/rss.ts'
import { parseFeedXml } from '../lib/data/rss-parser.ts'
import { cachedFetchWithFallback, clearCacheForTests } from '../lib/server/cache.ts'
import { GET as getLegacyAiNewsRoute } from '../app/api/ai-research/ai-news/route.ts'
import { GET as getTopicNewsRoute } from '../app/api/ai-research/news/[topic]/route.ts'

function daysAgoIso(days: number, now: Date = new Date()): string {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1_000).toISOString()
}

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

test('normalizeGithubSearchRepo maps GitHub search item with stars/day estimate', () => {
  const now = new Date('2026-03-06T00:00:00.000Z')
  const normalized = normalizeGithubSearchRepo(
    {
      full_name: 'openai/example',
      description: 'Example repo',
      language: 'TypeScript',
      stargazers_count: 900,
      created_at: '2026-02-04T00:00:00.000Z',
      html_url: 'https://github.com/openai/example',
    },
    now,
  )

  assert.ok(normalized)
  assert.equal(normalized?.owner, 'openai')
  assert.equal(normalized?.name, 'example')
  assert.equal(normalized?.totalStars, 900)
  assert.equal(normalized?.starsPerDay, 30)
})

test('isEmergingRepoCandidate enforces age and star bounds', () => {
  const now = new Date('2026-03-06T00:00:00.000Z')

  assert.equal(
    isEmergingRepoCandidate(
      { stargazers_count: 900, created_at: '2026-02-04T00:00:00.000Z' },
      now,
    ),
    true,
  )

  assert.equal(
    isEmergingRepoCandidate(
      { stargazers_count: 20, created_at: '2026-02-04T00:00:00.000Z' },
      now,
    ),
    false,
  )

  assert.equal(
    isEmergingRepoCandidate(
      { stargazers_count: 20000, created_at: '2026-02-04T00:00:00.000Z' },
      now,
    ),
    false,
  )

  assert.equal(
    isEmergingRepoCandidate(
      { stargazers_count: 900, created_at: '2025-08-01T00:00:00.000Z' },
      now,
    ),
    false,
  )
})

test('fetchTrendingRepos ranks higher-momentum mid-size repos above larger slower repos', async (t) => {
  const originalFetch = global.fetch

  global.fetch = (async () => {
    const body = {
      items: [
        {
          full_name: 'legacy/large-but-slow',
          description: 'Large incumbent',
          language: 'Python',
          stargazers_count: 14000,
          created_at: daysAgoIso(170),
          html_url: 'https://github.com/legacy/large-but-slow',
        },
        {
          full_name: 'rocket/mid-but-fast',
          description: 'Fast-growing repo',
          language: 'TypeScript',
          stargazers_count: 1200,
          created_at: daysAgoIso(12),
          html_url: 'https://github.com/rocket/mid-but-fast',
        },
        {
          full_name: 'steady/medium',
          description: 'Medium momentum',
          language: 'Go',
          stargazers_count: 5000,
          created_at: daysAgoIso(100),
          html_url: 'https://github.com/steady/medium',
        },
      ],
    }

    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }) as typeof fetch

  t.after(() => {
    global.fetch = originalFetch
  })

  const repos = await fetchTrendingRepos(3)

  assert.ok(repos)
  assert.equal(repos?.length, 3)
  assert.equal(repos?.[0]?.name, 'mid-but-fast')
  assert.equal(repos?.[1]?.name, 'large-but-slow')
})

test('fetchTrendingRepos returns null on GitHub non-ok or thrown fetch', async (t) => {
  const originalFetch = global.fetch

  global.fetch = (async () => new Response('{}', { status: 503 })) as typeof fetch
  const nonOkResult = await fetchTrendingRepos(5)
  assert.equal(nonOkResult, null)

  global.fetch = (async () => {
    throw new Error('network down')
  }) as typeof fetch
  const thrownResult = await fetchTrendingRepos(5)
  assert.equal(thrownResult, null)

  t.after(() => {
    global.fetch = originalFetch
  })
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

test('news topic feed mapping has at least one source for every topic', () => {
  for (const topic of NEWS_TOPICS) {
    assert.ok(Array.isArray(NEWS_TOPIC_FEEDS[topic]))
    assert.ok(NEWS_TOPIC_FEEDS[topic].length > 0)
  }
})

test('fetchNewsItemsByTopic returns sorted and deduped NewsItem entries', async (t) => {
  clearCacheForTests()

  const originalFetch = global.fetch
  let callCount = 0

  global.fetch = (async () => {
    callCount += 1
    const xml = `
      <rss><channel>
        <item>
          <title>Older Story</title>
          <link>https://example.com/older</link>
          <pubDate>Wed, 05 Mar 2026 10:00:00 GMT</pubDate>
        </item>
        <item>
          <title>Newest Story</title>
          <link>https://example.com/newest</link>
          <pubDate>Thu, 06 Mar 2026 10:00:00 GMT</pubDate>
        </item>
        <item>
          <title>Newest Story</title>
          <link>https://example.com/newest</link>
          <pubDate>Thu, 06 Mar 2026 10:00:00 GMT</pubDate>
        </item>
      </channel></rss>
    `

    return new Response(xml, {
      status: 200,
      headers: { 'Content-Type': 'application/xml' },
    })
  }) as typeof fetch

  t.after(() => {
    global.fetch = originalFetch
  })

  const items = await fetchNewsItemsByTopic('general', 20)

  assert.ok(callCount > 0)
  assert.equal(items.length, 2)
  assert.equal(items[0]?.title, 'Newest Story')
  assert.equal(items[1]?.title, 'Older Story')
})

test('fetchNewsItemsByTopic sets category by topic label', async (t) => {
  clearCacheForTests()

  const originalFetch = global.fetch
  global.fetch = (async () =>
    new Response(
      `
        <rss><channel>
          <item>
            <title>Policy headline</title>
            <link>https://example.com/policy</link>
            <pubDate>Thu, 06 Mar 2026 12:00:00 GMT</pubDate>
          </item>
        </channel></rss>
      `,
      { status: 200, headers: { 'Content-Type': 'application/xml' } },
    )) as typeof fetch

  t.after(() => {
    global.fetch = originalFetch
  })

  const items = await fetchNewsItemsByTopic('policy', 5)

  assert.ok(items.length > 0)
  assert.equal(items[0]?.category, 'AI Policy & Regulation')
})

test('news topic route returns valid SectionData for valid topic', async (t) => {
  clearCacheForTests()

  const originalFetch = global.fetch
  global.fetch = (async () =>
    new Response(
      `
        <rss><channel>
          <item>
            <title>General AI update</title>
            <link>https://example.com/general</link>
            <pubDate>Thu, 06 Mar 2026 13:00:00 GMT</pubDate>
          </item>
        </channel></rss>
      `,
      { status: 200, headers: { 'Content-Type': 'application/xml' } },
    )) as typeof fetch

  t.after(() => {
    global.fetch = originalFetch
  })

  const response = await getTopicNewsRoute(new Request('http://localhost'), {
    params: Promise.resolve({ topic: 'general' }),
  })
  const body = (await response.json()) as { items: unknown[]; fetchedAt: string }

  assert.equal(response.status, 200)
  assert.ok(Array.isArray(body.items))
  assert.equal(typeof body.fetchedAt, 'string')
  assert.equal(response.headers.get('X-Cache-Tier'), 'medium')
  assert.equal(response.headers.get('X-Data-Source'), 'fresh')
})

test('news topic route returns safe empty payload for invalid topic', async () => {
  clearCacheForTests()

  const response = await getTopicNewsRoute(new Request('http://localhost'), {
    params: Promise.resolve({ topic: 'not-a-topic' }),
  })
  const body = (await response.json()) as { items: unknown[]; fetchedAt: string }

  assert.equal(response.status, 200)
  assert.deepEqual(body.items, [])
  assert.equal(typeof body.fetchedAt, 'string')
  assert.equal(response.headers.get('X-Cache-Tier'), 'medium')
  assert.equal(response.headers.get('X-Data-Source'), 'none')
})

test('news topic route shows cache metadata as fresh then memory/redis', async (t) => {
  clearCacheForTests()

  const originalFetch = global.fetch
  global.fetch = (async () =>
    new Response(
      `
        <rss><channel>
          <item>
            <title>Caching check</title>
            <link>https://example.com/cache</link>
            <pubDate>Thu, 06 Mar 2026 15:00:00 GMT</pubDate>
          </item>
        </channel></rss>
      `,
      { status: 200, headers: { 'Content-Type': 'application/xml' } },
    )) as typeof fetch

  t.after(() => {
    global.fetch = originalFetch
  })

  const first = await getTopicNewsRoute(new Request('http://localhost'), {
    params: Promise.resolve({ topic: 'general' }),
  })
  const second = await getTopicNewsRoute(new Request('http://localhost'), {
    params: Promise.resolve({ topic: 'general' }),
  })

  assert.equal(first.headers.get('X-Data-Source'), 'fresh')
  assert.ok(['memory', 'redis'].includes(second.headers.get('X-Data-Source') ?? ''))
})

test('news topic route serves stale fallback when upstream fails after cache expiry', async (t) => {
  clearCacheForTests()

  const originalFetch = global.fetch
  const originalNow = Date.now
  const originalRedisUrl = process.env.UPSTASH_REDIS_REST_URL
  const originalRedisToken = process.env.UPSTASH_REDIS_REST_TOKEN
  let now = 1_800_000_000_000

  process.env.UPSTASH_REDIS_REST_URL = ''
  process.env.UPSTASH_REDIS_REST_TOKEN = ''
  Date.now = () => now

  global.fetch = (async () =>
    new Response(
      `
        <rss><channel>
          <item>
            <title>Stale seed</title>
            <link>https://example.com/stale-seed</link>
            <pubDate>Thu, 06 Mar 2026 16:00:00 GMT</pubDate>
          </item>
        </channel></rss>
      `,
      { status: 200, headers: { 'Content-Type': 'application/xml' } },
    )) as typeof fetch

  const seeded = await getTopicNewsRoute(new Request('http://localhost'), {
    params: Promise.resolve({ topic: 'general' }),
  })
  assert.equal(seeded.headers.get('X-Data-Source'), 'fresh')

  now += 3_601_000
  global.fetch = (async () => {
    throw new Error('upstream unavailable')
  }) as typeof fetch

  const stale = await getTopicNewsRoute(new Request('http://localhost'), {
    params: Promise.resolve({ topic: 'general' }),
  })
  const body = (await stale.json()) as { items: unknown[] }

  t.after(() => {
    global.fetch = originalFetch
    Date.now = originalNow
    process.env.UPSTASH_REDIS_REST_URL = originalRedisUrl
    process.env.UPSTASH_REDIS_REST_TOKEN = originalRedisToken
  })

  assert.equal(stale.headers.get('X-Data-Source'), 'stale')
  assert.ok(body.items.length > 0)
})

test('legacy ai-news route mirrors general topic items', async (t) => {
  clearCacheForTests()

  const originalFetch = global.fetch
  global.fetch = (async () =>
    new Response(
      `
        <rss><channel>
          <item>
            <title>Legacy mirror headline</title>
            <link>https://example.com/legacy</link>
            <pubDate>Thu, 06 Mar 2026 17:00:00 GMT</pubDate>
          </item>
        </channel></rss>
      `,
      { status: 200, headers: { 'Content-Type': 'application/xml' } },
    )) as typeof fetch

  t.after(() => {
    global.fetch = originalFetch
  })

  const generalResponse = await getTopicNewsRoute(new Request('http://localhost'), {
    params: Promise.resolve({ topic: 'general' }),
  })
  const legacyResponse = await getLegacyAiNewsRoute()

  const generalBody = (await generalResponse.json()) as { items: unknown[] }
  const legacyBody = (await legacyResponse.json()) as { items: unknown[] }

  assert.deepEqual(legacyBody.items, generalBody.items)
  assert.equal(legacyResponse.headers.get('X-Cache-Tier'), 'medium')
  assert.ok(['memory', 'redis', 'fresh'].includes(legacyResponse.headers.get('X-Data-Source') ?? ''))
})

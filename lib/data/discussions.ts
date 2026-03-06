import type { DiscussionItem } from '../types'

const HN_TOP_STORIES_URL = 'https://hacker-news.firebaseio.com/v0/topstories.json'
const HN_ITEM_URL = 'https://hacker-news.firebaseio.com/v0/item'
const LOBSTERS_HOTTEST_URL = 'https://lobste.rs/hottest.json'
const HN_CONCURRENCY = 10

interface HackerNewsItem {
  id?: number
  type?: string
  title?: string
  url?: string
  score?: number
  descendants?: number
  time?: number
}

interface LobstersItem {
  short_id?: string
  title?: string
  score?: number
  comments_count?: number
  created_at?: string
  url?: string
}

export function normalizeHackerNewsItem(item: HackerNewsItem): DiscussionItem | null {
  if (!item.id || item.type !== 'story' || !item.title) return null

  const submittedAtMs = (item.time ?? 0) * 1_000
  const publishedAt = submittedAtMs > 0
    ? new Date(submittedAtMs).toISOString()
    : new Date().toISOString()

  return {
    type: 'discussion',
    id: `hn-${item.id}`,
    title: item.title,
    points: item.score ?? 0,
    commentCount: item.descendants ?? 0,
    source: 'HN',
    publishedAt,
    url: item.url || `https://news.ycombinator.com/item?id=${item.id}`,
  }
}

function normalizeLobstersItem(item: LobstersItem, index: number): DiscussionItem | null {
  if (!item.title) return null

  const shortId = item.short_id || `item-${index}`

  return {
    type: 'discussion',
    id: `lobsters-${shortId}`,
    title: item.title,
    points: item.score ?? 0,
    commentCount: item.comments_count ?? 0,
    source: 'Lobste.rs',
    publishedAt: item.created_at
      ? new Date(item.created_at).toISOString()
      : new Date().toISOString(),
    url: item.url || `https://lobste.rs/s/${shortId}`,
  }
}

async function fetchJson<T>(url: string, timeoutMs: number): Promise<T | null> {
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(timeoutMs),
      headers: { 'User-Agent': 'Stratum/0.2' },
    })

    if (!response.ok) return null
    return (await response.json()) as T
  } catch {
    return null
  }
}

async function fetchHackerNews(limit: number): Promise<DiscussionItem[]> {
  const ids = await fetchJson<number[]>(HN_TOP_STORIES_URL, 10_000)
  if (!Array.isArray(ids) || ids.length === 0) return []

  const selected = ids.slice(0, Math.max(limit, 30))
  const items: DiscussionItem[] = []

  for (let i = 0; i < selected.length; i += HN_CONCURRENCY) {
    const batch = selected.slice(i, i + HN_CONCURRENCY)
    const settled = await Promise.allSettled(
      batch.map(async (id) => fetchJson<HackerNewsItem>(`${HN_ITEM_URL}/${id}.json`, 5_000)),
    )

    for (const result of settled) {
      if (result.status !== 'fulfilled' || !result.value) continue
      const normalized = normalizeHackerNewsItem(result.value)
      if (normalized) items.push(normalized)
    }
  }

  return items
}

async function fetchLobsters(limit: number): Promise<DiscussionItem[]> {
  const raw = await fetchJson<LobstersItem[]>(LOBSTERS_HOTTEST_URL, 8_000)
  if (!Array.isArray(raw) || raw.length === 0) return []

  return raw
    .slice(0, limit)
    .map((item, index) => normalizeLobstersItem(item, index))
    .filter((item): item is DiscussionItem => item !== null)
}

function bySignalStrength(a: DiscussionItem, b: DiscussionItem): number {
  if (b.points !== a.points) return b.points - a.points
  return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
}

export async function fetchDiscussions(limit = 20): Promise<DiscussionItem[]> {
  const [hnResult, lobstersResult] = await Promise.allSettled([
    fetchHackerNews(limit),
    fetchLobsters(Math.max(5, Math.floor(limit / 2))),
  ])

  const hnItems = hnResult.status === 'fulfilled' ? hnResult.value : []
  const lobstersItems = lobstersResult.status === 'fulfilled' ? lobstersResult.value : []

  // Silent fallback requested: if Lobsters fails, return HN-only.
  const merged = [...hnItems, ...lobstersItems]
  merged.sort(bySignalStrength)

  return merged.slice(0, limit)
}

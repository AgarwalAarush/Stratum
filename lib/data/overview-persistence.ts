import type { FeedItem, MorningBriefData } from '../types.ts'
import { getSupabaseClient } from '../server/supabase.ts'

interface OverviewRow {
  id: string
  type: string
  content: string
  date: string
  period_start: string | null
  period_end: string | null
  created_at: string
}

export async function saveDailyOverview(bullets: string[]): Promise<void> {
  const supabase = getSupabaseClient()
  if (!supabase) return

  const today = new Date().toISOString().slice(0, 10)

  await supabase
    .from('overviews')
    .upsert(
      { type: 'daily', content: JSON.stringify(bullets), date: today },
      { onConflict: 'type,date' },
    )
}

export async function saveGlobalNewsDailyOverview(bullets: string[]): Promise<void> {
  const supabase = getSupabaseClient()
  if (!supabase) return

  const today = new Date().toISOString().slice(0, 10)

  await supabase
    .from('overviews')
    .upsert(
      { type: 'daily:global-news', content: JSON.stringify(bullets), date: today },
      { onConflict: 'type,date' },
    )
}

export async function fetchGlobalNewsDailyOverviews(
  startDate: string,
  endDate: string,
): Promise<Array<{ date: string; bullets: string[] }>> {
  const supabase = getSupabaseClient()
  if (!supabase) return []

  const { data, error } = await supabase
    .from('overviews')
    .select('date, content')
    .eq('type', 'daily:global-news')
    .gte('date', startDate)
    .lte('date', endDate)
    .order('date', { ascending: true })

  if (error || !data) return []

  return (data as OverviewRow[]).map((row) => ({
    date: row.date,
    bullets: JSON.parse(row.content) as string[],
  }))
}

export async function fetchDailyOverviews(
  startDate: string,
  endDate: string,
): Promise<Array<{ date: string; bullets: string[] }>> {
  const supabase = getSupabaseClient()
  if (!supabase) return []

  const { data, error } = await supabase
    .from('overviews')
    .select('date, content')
    .eq('type', 'daily')
    .gte('date', startDate)
    .lte('date', endDate)
    .order('date', { ascending: true })

  if (error || !data) return []

  return (data as OverviewRow[]).map((row) => ({
    date: row.date,
    bullets: JSON.parse(row.content) as string[],
  }))
}

export async function fetchWeeklyOverviews(
  startDate: string,
  endDate: string,
): Promise<Array<{ date: string; content: string }>> {
  const supabase = getSupabaseClient()
  if (!supabase) return []

  const { data, error } = await supabase
    .from('overviews')
    .select('date, content')
    .eq('type', 'weekly')
    .gte('date', startDate)
    .lte('date', endDate)
    .order('date', { ascending: true })

  if (error || !data) return []

  return (data as OverviewRow[]).map((row) => ({
    date: row.date,
    content: row.content,
  }))
}

export async function fetchLatestOverview(
  type: 'weekly' | 'monthly',
): Promise<{ content: string; date: string; periodStart: string; periodEnd: string } | null> {
  const supabase = getSupabaseClient()
  if (!supabase) return null

  const { data, error } = await supabase
    .from('overviews')
    .select('content, date, period_start, period_end')
    .eq('type', type)
    .order('date', { ascending: false })
    .limit(1)
    .single()

  if (error || !data) return null

  const row = data as OverviewRow
  return {
    content: row.content,
    date: row.date,
    periodStart: row.period_start ?? row.date,
    periodEnd: row.period_end ?? row.date,
  }
}

export async function saveMorningBrief(data: import('../types').MorningBriefData): Promise<void> {
  const supabase = getSupabaseClient()
  if (!supabase) return

  const today = new Date().toISOString().slice(0, 10)

  await supabase
    .from('overviews')
    .upsert(
      { type: 'morning-brief', content: JSON.stringify(data), date: today },
      { onConflict: 'type,date' },
    )
}

export async function fetchLatestMorningBrief(): Promise<import('../types').MorningBriefData | null> {
  const supabase = getSupabaseClient()
  if (!supabase) return null

  const { data, error } = await supabase
    .from('overviews')
    .select('content, date')
    .eq('type', 'morning-brief')
    .order('date', { ascending: false })
    .limit(1)
    .single()

  if (error || !data) return null

  const row = data as OverviewRow
  const parsed = JSON.parse(row.content) as import('../types').MorningBriefData

  // Mark as stale if not from today
  const today = new Date().toISOString().slice(0, 10)
  if (row.date !== today) {
    parsed.stale = true
  }

  return parsed
}

export async function saveOverview(
  type: 'weekly' | 'monthly',
  content: string,
  date: string,
  periodStart: string,
  periodEnd: string,
): Promise<void> {
  const supabase = getSupabaseClient()
  if (!supabase) return

  await supabase
    .from('overviews')
    .upsert(
      {
        type,
        content,
        date,
        period_start: periodStart,
        period_end: periodEnd,
      },
      { onConflict: 'type,date' },
    )
}

export async function persistFeedItems(
  scope: string,
  section: string,
  items: FeedItem[],
): Promise<void> {
  const supabase = getSupabaseClient()
  if (!supabase) return

  try {
    const rows = items.map((item) => {
      const { type, title, url, ...rest } = item as unknown as Record<string, unknown>
      const publishedAt =
        (rest.publishedAt as string | undefined) ??
        (rest.reportDate as string | undefined) ??
        null
      // Remove fields already stored as columns
      delete rest.publishedAt
      delete rest.reportDate
      delete rest.title
      delete rest.url
      delete rest.type
      return {
        item_type: type as string,
        scope,
        section,
        title: title as string,
        url: url as string,
        published_at: publishedAt,
        metadata: rest,
      }
    })

    await supabase
      .from('feed_items')
      .upsert(rows, { onConflict: 'item_type,url' })
  } catch {
    // fire-and-forget — don't break the request
  }
}

export interface FeedItemRow {
  id: string
  item_type: string
  scope: string
  section: string
  title: string
  url: string
  published_at: string | null
  fetched_at: string
  metadata: Record<string, unknown>
}

export async function fetchRecentFeedItems(
  hoursBack: number,
): Promise<FeedItemRow[]> {
  const supabase = getSupabaseClient()
  if (!supabase) return []

  const since = new Date(Date.now() - hoursBack * 60 * 60 * 1_000).toISOString()

  const { data, error } = await supabase
    .from('feed_items')
    .select('*')
    .gte('fetched_at', since)
    .order('fetched_at', { ascending: false })
    .limit(300)

  if (error || !data) return []
  return data as FeedItemRow[]
}

export async function fetchYesterdaysBrief(): Promise<MorningBriefData | null> {
  const supabase = getSupabaseClient()
  if (!supabase) return null

  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1_000)
    .toISOString()
    .slice(0, 10)

  const { data, error } = await supabase
    .from('overviews')
    .select('content')
    .eq('type', 'morning-brief')
    .eq('date', yesterday)
    .limit(1)
    .single()

  if (error || !data) return null
  return JSON.parse((data as OverviewRow).content) as MorningBriefData
}

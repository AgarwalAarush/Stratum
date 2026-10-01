import type { FeedItem, MorningBriefData, OverviewData } from '../types.ts'
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

export async function saveDailyOverview(data: OverviewData): Promise<void> { await saveDailyIntelligence('daily', data) }
export async function saveGlobalNewsDailyOverview(data: OverviewData): Promise<void> { await saveDailyIntelligence('daily:global-news', data) }

async function saveDailyIntelligence(type: string, data: OverviewData): Promise<void> {
  const supabase = getSupabaseClient()
  if (!supabase) throw new Error('Supabase service credentials are not configured')
  const attempt = await supabase.from('intelligence_generation_attempts').insert({ type, readiness: data.readiness ?? 'blocked', metadata: data })
  if (attempt.error) throw new Error(`Unable to record intelligence attempt: ${attempt.error.message}`)
  if (!['complete', 'partial'].includes(data.readiness ?? '') || !data.bullets.length || !data.sources?.length || !data.generatedAt) return
  const { error } = await supabase.from('overviews').upsert({ type, content: JSON.stringify(data.bullets), date: data.generatedAt.slice(0, 10), artifact_metadata: data }, { onConflict: 'type,date' })
  if (error) throw new Error(`Unable to persist intelligence: ${error.message}`)
}

export async function fetchLatestDailyIntelligence(type: 'daily' | 'daily:global-news'): Promise<OverviewData> {
  const supabase = getSupabaseClient()
  const unavailable: OverviewData = { bullets: [], fetchedAt: '', generatedAt: null, dataAsOf: null, readiness: 'blocked', errors: ['No accepted intelligence is available'], sourceCoverage: [], sources: [] }
  if (!supabase) return unavailable
  const [accepted, attempt] = await Promise.all([
    supabase.from('overviews').select('artifact_metadata').eq('type', type).not('artifact_metadata', 'is', null).order('date', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('intelligence_generation_attempts').select('metadata').eq('type', type).order('created_at', { ascending: false }).limit(1).maybeSingle(),
  ])
  if (accepted.error || attempt.error) throw new Error('Unable to read intelligence readiness')
  const data = accepted.data?.artifact_metadata as OverviewData | undefined
  const latest = attempt.data?.metadata as OverviewData | undefined
  if (!data) return latest ?? unavailable
  const failed = latest && ['failed', 'blocked'].includes(latest.readiness ?? '')
  return { ...data, stale: failed || data.generatedAt?.slice(0, 10) !== new Date().toISOString().slice(0, 10),
    ...(failed ? { readiness: latest.readiness, errors: latest.errors } : {}) }
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
  options: { strict?: boolean } = {},
): Promise<FeedItemRow[]> {
  const supabase = getSupabaseClient()
  if (!supabase) {
    if (options.strict) throw new Error('Supabase service credentials are not configured')
    return []
  }

  try {
    const observedAt = new Date().toISOString()
    const normalizedRows = items.map((item) => {
      const { type, title, url, ...rest } = item as unknown as Record<string, unknown>
      const reportedPublishedAt =
        (rest.publishedAt as string | undefined) ??
        (rest.reportDate as string | undefined) ??
        null
      const publication = normalizeFeedPublishedAt(reportedPublishedAt, observedAt)
      // Remove fields already stored as columns
      delete rest.publishedAt
      delete rest.reportDate
      delete rest.title
      delete rest.url
      delete rest.type
      if (publication.anomaly && reportedPublishedAt) {
        rest.reportedPublishedAt = reportedPublishedAt
        rest.publishedAtAnomaly = 'publication_after_ingestion'
      }
      return {
        item_type: type as string,
        scope,
        section,
        title: title as string,
        url: url as string,
        published_at: publication.publishedAt,
        metadata: rest,
      }
    })
    const rows = [...new Map(normalizedRows.map((row) => [
      `${row.item_type}:${row.url}`,
      row,
    ])).values()]

    const { data, error } = await supabase
      .from('feed_items')
      .upsert(rows, { onConflict: 'item_type,url' })
      .select('id,item_type,scope,section,title,url,published_at,fetched_at,metadata')
    if (error) throw new Error(`Unable to persist feed items: ${error.message}`)
    return (data ?? []) as FeedItemRow[]
  } catch (error) {
    if (options.strict) throw error
    // fire-and-forget — don't break the request
    return []
  }
}

export function normalizeFeedPublishedAt(value: string | null, fetchedAt: string): { publishedAt: string | null; anomaly: boolean } {
  if (!value) return { publishedAt: null, anomaly: false }
  const published = Date.parse(value)
  const fetched = Date.parse(fetchedAt)
  if (!Number.isFinite(published)) return { publishedAt: null, anomaly: true }
  if (Number.isFinite(fetched) && published > fetched + 5 * 60_000) return { publishedAt: fetchedAt, anomaly: true }
  return { publishedAt: new Date(published).toISOString(), anomaly: false }
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

import { getSupabaseClient } from '../server/supabase'

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

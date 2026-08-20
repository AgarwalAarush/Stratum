import { persistBiotechCatalystSources } from '../lib/server/biotech-catalysts.ts'
import { getSupabaseClient } from '../lib/server/supabase.ts'

function daysArgument(): number {
  const value = Number(process.argv.find((argument) => argument.startsWith('--days='))?.split('=')[1] ?? 365)
  if (!Number.isInteger(value) || value < 1 || value > 730) throw new Error('--days must be an integer between 1 and 730')
  return value
}

async function main(): Promise<void> {
  const supabase = getSupabaseClient()
  if (!supabase) throw new Error('Supabase service credentials are not configured')
  const since = new Date(Date.now() - daysArgument() * 86_400_000).toISOString()
  let scanned = 0
  let detected = 0
  let persisted = 0
  for (let from = 0; ; from += 1_000) {
    const { data, error } = await supabase.from('feed_items')
      .select('id,title,url,published_at,fetched_at,metadata')
      .gte('published_at', since)
      .order('published_at', { ascending: true })
      .range(from, from + 999)
    if (error) throw new Error(`Unable to load historical biotech evidence: ${error.message}`)
    const page = data ?? []
    scanned += page.length
    const result = await persistBiotechCatalystSources(page.map((row) => ({
      id: `feed:${row.id}`,
      feedItemId: String(row.id),
      title: String(row.title),
      url: String(row.url),
      publisher: typeof row.metadata?.canonicalSource === 'string' ? row.metadata.canonicalSource : new URL(String(row.url)).hostname,
      publishedAt: typeof row.published_at === 'string' ? row.published_at : null,
      fetchedAt: String(row.fetched_at),
      metadata: row.metadata as Record<string, unknown>,
    })))
    detected += result.detected
    persisted += result.persisted
    if (page.length < 1_000) break
  }
  console.info(JSON.stringify({ scanned, detected, persisted, since }, null, 2))
}

await main()

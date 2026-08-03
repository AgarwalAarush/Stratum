import { composeLatestMarketOverview, fetchLatestSnapshotMeta } from './markets-repository.ts'
import type { MarketFeed } from '../markets/types.ts'
import { getSupabaseClient } from './supabase.ts'

interface MarketSnapshotRecord {
  id: string
  feed: MarketFeed
  data_as_of: string
  published_at: string | null
}

async function fetchMarketSnapshot(snapshotId?: string): Promise<MarketSnapshotRecord | null> {
  if (!snapshotId) return fetchLatestSnapshotMeta()

  const supabase = getSupabaseClient()
  if (!supabase) return null
  const { data, error } = await supabase
    .from('market_snapshots')
    .select('id,feed,data_as_of,published_at')
    .eq('id', snapshotId)
    .eq('status', 'complete')
    .maybeSingle()
  return error || !data ? null : data as MarketSnapshotRecord
}

export async function materializeMarketHomeSnapshot(snapshotId?: string): Promise<{
  snapshotId: string
  dataAsOf: string
  generatedAt: string
}> {
  const supabase = getSupabaseClient()
  if (!supabase) throw new Error('Supabase service credentials are not configured')

  // Snapshot artifacts are immutable. A newer screener publication must not
  // cause an in-flight state/memo job for this snapshot to fail; the reader
  // selects only the latest snapshot's matching artifact.
  const snapshot = await fetchMarketSnapshot(snapshotId)
  if (!snapshot) throw new Error('No completed market snapshot is available')

  const overview = await composeLatestMarketOverview(snapshot)
  if (!overview) throw new Error('Unable to compose the latest market home snapshot')

  const generatedAt = new Date().toISOString()
  const { error } = await supabase.from('market_home_snapshots').upsert({
    snapshot_id: snapshot.id,
    content: overview,
    data_as_of: overview.dataAsOf,
    generated_at: generatedAt,
  }, { onConflict: 'snapshot_id' })
  if (error) throw new Error(`Unable to persist market home snapshot: ${error.message}`)

  return { snapshotId: snapshot.id, dataAsOf: overview.dataAsOf, generatedAt }
}

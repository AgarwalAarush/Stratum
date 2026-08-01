import { composeLatestMarketOverview, fetchLatestSnapshotMeta } from './markets-repository.ts'
import { getSupabaseClient } from './supabase.ts'

export async function materializeMarketHomeSnapshot(snapshotId?: string): Promise<{
  snapshotId: string
  dataAsOf: string
  generatedAt: string
}> {
  const supabase = getSupabaseClient()
  if (!supabase) throw new Error('Supabase service credentials are not configured')

  const snapshot = await fetchLatestSnapshotMeta({ bypassCache: true })
  if (!snapshot) throw new Error('No completed market snapshot is available')
  if (snapshotId && snapshot.id !== snapshotId) {
    throw new Error('Requested market home snapshot is no longer current')
  }

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

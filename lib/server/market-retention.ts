import { getSupabaseClient } from './supabase.ts'


function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? '', 10)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

export function marketRetentionCutoffs(
  now = new Date(),
  environment: NodeJS.ProcessEnv = process.env,
): { marketSnapshotsBefore: string; crossAssetBefore: string; agentJobsBefore: string } {
  const before = (days: number) => new Date(now.getTime() - days * 86_400_000).toISOString()
  return {
    marketSnapshotsBefore: before(positiveInteger(environment.MARKET_SNAPSHOT_RETENTION_DAYS, 7)),
    crossAssetBefore: before(positiveInteger(environment.CROSS_ASSET_RETENTION_DAYS, 30)),
    agentJobsBefore: before(positiveInteger(environment.AGENT_JOB_RETENTION_DAYS, 30)),
  }
}

export interface MarketRetentionResult {
  marketSnapshotsPruned: number
  crossAssetSnapshotsPruned: number
  agentJobsPruned: number
  protectedMemoSnapshots: number
  continuation: boolean
  errors: string[]
}

export async function pruneMarketData(now = new Date()): Promise<MarketRetentionResult> {
  const supabase = getSupabaseClient()
  if (!supabase) throw new Error('Supabase service credentials are not configured')
  const cutoffs = marketRetentionCutoffs(now)
  const result: MarketRetentionResult = { marketSnapshotsPruned: 0, crossAssetSnapshotsPruned: 0, agentJobsPruned: 0, protectedMemoSnapshots: 0, continuation: false, errors: [] }
  const deadline = Date.now() + 25_000
  // The SQL slice protects market_memos and their immutable state. Unlike a
  // bulk cascading delete, one blocked snapshot cannot starve other retention.
  try {
    while (Date.now() < deadline) {
      const slice = await supabase.rpc('prune_market_snapshot_slice', { p_before: cutoffs.marketSnapshotsBefore })
      if (slice.error) throw new Error(slice.error.message)
      const output = slice.data as { deleted: number; removed: boolean; more: boolean }
      result.marketSnapshotsPruned += Number(output.removed)
      result.continuation = output.more
      if (!output.more) break
    }
  } catch (error) { result.errors.push(`Market snapshots: ${error instanceof Error ? error.message : String(error)}`) }
  // These phases execute independently, even after a failed snapshot slice.
  try {
    const expired = await supabase.from('cross_asset_snapshots').select('id').eq('is_latest', false).lt('created_at', cutoffs.crossAssetBefore).order('created_at').limit(25)
    if (expired.error) throw new Error(expired.error.message)
    for (const row of expired.data ?? []) {
      const deletion = await supabase.from('cross_asset_snapshots').delete().eq('id', row.id).eq('is_latest', false)
      if (deletion.error) throw new Error(deletion.error.message)
      result.crossAssetSnapshotsPruned++
    }
    result.continuation ||= (expired.data?.length ?? 0) === 25
  } catch (error) { result.errors.push(`Cross asset: ${error instanceof Error ? error.message : String(error)}`) }
  try {
    const expired = await supabase.from('agent_jobs').select('id').in('status', ['succeeded', 'failed', 'cancelled']).lt('updated_at', cutoffs.agentJobsBefore).order('updated_at').limit(100)
    if (expired.error) throw new Error(expired.error.message)
    if (expired.data?.length) {
      const deletion = await supabase.from('agent_jobs').delete().in('id', expired.data.map(row => row.id)).in('status', ['succeeded', 'failed', 'cancelled'])
      if (deletion.error) throw new Error(deletion.error.message)
      result.agentJobsPruned = expired.data.length
    }
    result.continuation ||= (expired.data?.length ?? 0) === 100
  } catch (error) { result.errors.push(`Agent jobs: ${error instanceof Error ? error.message : String(error)}`) }
  return result
}

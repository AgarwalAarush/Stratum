import { getSupabaseClient } from './supabase.ts'

const QUERY_PAGE_SIZE = 1_000
const MUTATION_BATCH_SIZE = 250

function chunks<T>(items: T[], size = MUTATION_BATCH_SIZE): T[][] {
  const result: T[][] = []
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size))
  return result
}

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

async function loadAllIds(
  loader: (from: number, to: number) => PromiseLike<{
    data: Array<{ id: string }> | null
    error: { message: string } | null
  }>,
  label: string,
): Promise<string[]> {
  const ids: string[] = []
  for (let from = 0; ; from += QUERY_PAGE_SIZE) {
    const { data, error } = await loader(from, from + QUERY_PAGE_SIZE - 1)
    if (error) throw new Error(`Unable to load ${label}: ${error.message}`)
    const page = data ?? []
    ids.push(...page.map((row) => row.id))
    if (page.length < QUERY_PAGE_SIZE) break
  }
  return ids
}

export interface MarketRetentionResult {
  marketSnapshotsPruned: number
  crossAssetSnapshotsPruned: number
  agentJobsPruned: number
  protectedMemoSnapshots: number
}

export async function pruneMarketData(now = new Date()): Promise<MarketRetentionResult> {
  const supabase = getSupabaseClient()
  if (!supabase) throw new Error('Supabase service credentials are not configured')
  const cutoffs = marketRetentionCutoffs(now)

  const memoStateIds = await loadAllIds(
    (from, to) => supabase.from('market_memos').select('id:market_state_id').range(from, to),
    'market memo state IDs',
  )
  const protectedSnapshotIds = new Set<string>()
  for (const batch of chunks(memoStateIds)) {
    const { data, error } = await supabase
      .from('market_states')
      .select('snapshot_id')
      .in('id', batch)
    if (error) throw new Error(`Unable to load protected market snapshots: ${error.message}`)
    for (const row of data ?? []) protectedSnapshotIds.add(row.snapshot_id)
  }

  const oldMarketSnapshotIds = await loadAllIds(
    (from, to) => supabase
      .from('market_snapshots')
      .select('id')
      .eq('is_latest', false)
      .lt('created_at', cutoffs.marketSnapshotsBefore)
      .order('created_at', { ascending: true })
      .range(from, to),
    'expired market snapshots',
  )
  const marketSnapshotIds = oldMarketSnapshotIds.filter((id) => !protectedSnapshotIds.has(id))
  for (const batch of chunks(marketSnapshotIds)) {
    const { error } = await supabase.from('market_snapshots').delete().in('id', batch).eq('is_latest', false)
    if (error) throw new Error(`Unable to prune market snapshots: ${error.message}`)
  }

  const crossAssetSnapshotIds = await loadAllIds(
    (from, to) => supabase
      .from('cross_asset_snapshots')
      .select('id')
      .eq('is_latest', false)
      .lt('created_at', cutoffs.crossAssetBefore)
      .order('created_at', { ascending: true })
      .range(from, to),
    'expired cross-asset snapshots',
  )
  for (const batch of chunks(crossAssetSnapshotIds)) {
    const { error } = await supabase.from('cross_asset_snapshots').delete().in('id', batch).eq('is_latest', false)
    if (error) throw new Error(`Unable to prune cross-asset snapshots: ${error.message}`)
  }

  const { data: deletedJobs, error: jobError } = await supabase
    .from('agent_jobs')
    .delete()
    .in('status', ['succeeded', 'failed', 'cancelled'])
    .lt('updated_at', cutoffs.agentJobsBefore)
    .select('id')
  if (jobError) throw new Error(`Unable to prune completed agent jobs: ${jobError.message}`)

  return {
    marketSnapshotsPruned: marketSnapshotIds.length,
    crossAssetSnapshotsPruned: crossAssetSnapshotIds.length,
    agentJobsPruned: deletedJobs?.length ?? 0,
    protectedMemoSnapshots: protectedSnapshotIds.size,
  }
}

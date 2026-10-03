import { getSupabaseClient } from './supabase.ts'
import { CURRENT_RESEARCH_CONTRACT_VERSION } from '../markets/research-contract.ts'

export interface WorkerHeartbeatInput {
  workerId: string
  schedulerEnabled: boolean
  fmpEnabled: boolean
  codexEnabled: boolean
  healthStatus?: 'starting' | 'healthy' | 'degraded'
  lastLoopAt?: string
  releaseSha?: string
}

export async function recordWorkerHeartbeat(input: WorkerHeartbeatInput): Promise<{ readinessSchema: 'current' | 'legacy' }> {
  const supabase = getSupabaseClient()
  if (!supabase) throw new Error('Supabase service credentials are not configured')
  const legacy = {
    worker_id: input.workerId,
    scheduler_enabled: input.schedulerEnabled,
    fmp_enabled: input.fmpEnabled,
    codex_enabled: input.codexEnabled,
    last_seen_at: new Date().toISOString(),
  }
  const { error } = await supabase.from('worker_heartbeats').upsert({
    ...legacy,
    release_sha: input.releaseSha ?? process.env.STRATUM_RELEASE_SHA ?? null,
    research_contract_version: CURRENT_RESEARCH_CONTRACT_VERSION,
    health_status: input.healthStatus ?? 'starting',
    last_loop_at: input.lastLoopAt ?? null,
  }, { onConflict: 'worker_id' })
  if (error && ['42703', 'PGRST204'].includes(error.code)
    && /release_sha|research_contract_version|health_status|last_loop_at/.test(error.message)) {
    const fallback = await supabase.from('worker_heartbeats').upsert(legacy, { onConflict: 'worker_id' })
    if (fallback.error) throw new Error(`Unable to record worker heartbeat: ${fallback.error.message}`)
    return { readinessSchema: 'legacy' }
  }
  if (error) throw new Error(`Unable to record worker heartbeat: ${error.message}`)
  return { readinessSchema: 'current' }
}

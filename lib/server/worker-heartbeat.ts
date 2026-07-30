import { getSupabaseClient } from './supabase.ts'

export interface WorkerHeartbeatInput {
  workerId: string
  schedulerEnabled: boolean
  fmpEnabled: boolean
  codexEnabled: boolean
}

export async function recordWorkerHeartbeat(input: WorkerHeartbeatInput): Promise<void> {
  const supabase = getSupabaseClient()
  if (!supabase) throw new Error('Supabase service credentials are not configured')
  const { error } = await supabase.from('worker_heartbeats').upsert({
    worker_id: input.workerId,
    scheduler_enabled: input.schedulerEnabled,
    fmp_enabled: input.fmpEnabled,
    codex_enabled: input.codexEnabled,
    last_seen_at: new Date().toISOString(),
  }, { onConflict: 'worker_id' })
  if (error) throw new Error(`Unable to record worker heartbeat: ${error.message}`)
}

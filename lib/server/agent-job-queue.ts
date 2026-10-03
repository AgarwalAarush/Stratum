import {
  agentJobPriority,
  buildAgentJobDedupeKey,
  parseAgentJobType,
  shouldCoalesceAgentJob,
  type AgentJobPayload,
  type AgentJobType,
} from './agent-job-contracts.ts'
import { getSupabaseClient } from './supabase.ts'

export function isMissingDedupeConstraint(message: string): boolean {
  return message.includes('no unique or exclusion constraint matching the ON CONFLICT specification')
}

export async function enqueueAgentJob<T extends AgentJobType>(
  jobType: T,
  payload: AgentJobPayload<T> = {} as AgentJobPayload<T>,
  dedupeKey = buildAgentJobDedupeKey(jobType, new Date(), payload),
  options: { runAfter?: Date; priority?: number } = {},
): Promise<{ id: string; deduplicated: boolean }> {
  parseAgentJobType(jobType)
  const supabase = getSupabaseClient()
  if (!supabase) throw new Error('Supabase service credentials are not configured')

  if (shouldCoalesceAgentJob(jobType, payload)) {
    const { data: pending, error: pendingError } = await supabase
      .from('agent_jobs')
      .select('id')
      .eq('job_type', jobType)
      .in('status', ['queued', 'running'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (pendingError) throw new Error(`Unable to inspect active ${jobType} work: ${pendingError.message}`)
    if (pending) return { id: String(pending.id), deduplicated: true }
  }

  const queuedJob = {
    job_type: jobType,
    payload,
    dedupe_key: dedupeKey,
    priority: options.priority ?? agentJobPriority(jobType),
    ...(options.runAfter ? { run_after: options.runAfter.toISOString() } : {}),
  }
  const { data, error } = await supabase
    .from('agent_jobs')
    .upsert(queuedJob, { onConflict: 'dedupe_key', ignoreDuplicates: true })
    .select('id')
    .maybeSingle()
  if (error && !isMissingDedupeConstraint(error.message)) {
    throw new Error(`Unable to enqueue agent job: ${error.message}`)
  }
  if (data) return { id: data.id, deduplicated: false }

  const { data: existing, error: existingError } = await supabase
    .from('agent_jobs')
    .select('id')
    .eq('dedupe_key', dedupeKey)
    .maybeSingle()
  if (existingError) throw new Error(`Unable to find deduplicated agent job: ${existingError.message}`)
  if (existing) return { id: existing.id, deduplicated: true }

  if (!error) throw new Error(`Unable to find deduplicated agent job: ${dedupeKey}`)
  const { data: inserted, error: insertError } = await supabase
    .from('agent_jobs')
    .insert(queuedJob)
    .select('id')
    .single()
  if (insertError || !inserted) {
    throw new Error(`Unable to enqueue agent job without the dedupe index: ${insertError?.message ?? dedupeKey}`)
  }
  return { id: inserted.id, deduplicated: false }
}

import type { ResearchJobStatus } from '../markets/types.ts'
import { getSupabaseClient } from './supabase.ts'

const RESEARCH_JOB_TYPES = ['generate-company-research', 'generate-etf-research', 'event-refresh-company-research']

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function boundedProgress(value: unknown, fallback: number): number {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? Math.max(0, Math.min(100, Math.round(numeric))) : fallback
}

function fallbackProgress(status: ResearchJobStatus['status']): number {
  if (status === 'queued') return 8
  if (status === 'running') return 25
  if (status === 'succeeded') return 100
  return 0
}

function fallbackPhase(status: ResearchJobStatus['status']): string {
  if (status === 'queued') return 'Waiting for research worker'
  if (status === 'running') return 'Building research'
  if (status === 'succeeded') return 'Research complete'
  if (status === 'cancelled') return 'Research cancelled'
  return 'Research failed'
}

interface ResearchJobRow {
  id: string
  status: ResearchJobStatus['status']
  payload: Record<string, unknown>
  last_error: string | null
  created_at: string
  updated_at: string
}

interface ResearchRunRow {
  job_id: string
  output: Record<string, unknown> | null
  error: string | null
  started_at: string
}

function normalizeResearchJob(job: ResearchJobRow, run?: ResearchRunRow): ResearchJobStatus {
  const output = record(run?.output)
  const fallback = fallbackProgress(job.status)
  return {
    id: job.id,
    symbol: typeof job.payload.symbol === 'string' ? job.payload.symbol : '',
    status: job.status,
    progress: job.status === 'succeeded' ? 100 : boundedProgress(output.progress, fallback),
    phase: job.status === 'succeeded'
      ? 'Research complete'
      : typeof output.phase === 'string' && output.phase
        ? output.phase
        : fallbackPhase(job.status),
    error: job.last_error ?? run?.error ?? null,
    createdAt: job.created_at,
    updatedAt: job.updated_at,
  }
}

export async function fetchResearchJobs(
  ownerId: string,
  options: { id?: string; symbol?: string; limit?: number } = {},
): Promise<ResearchJobStatus[]> {
  const supabase = getSupabaseClient()
  if (!supabase) return []

  let query = supabase
    .from('agent_jobs')
    .select('id,status,payload,last_error,created_at,updated_at')
    .in('job_type', RESEARCH_JOB_TYPES)
    .contains('payload', { ownerId })
    .order('created_at', { ascending: false })
    .limit(options.limit ?? 12)
  if (options.id) query = query.eq('id', options.id)
  if (options.symbol) query = query.contains('payload', { symbol: options.symbol.toUpperCase() })

  const { data, error } = await query
  if (error || !data || data.length === 0) return []
  const jobs = data as ResearchJobRow[]
  const { data: runData } = await supabase
    .from('agent_runs')
    .select('job_id,output,error,started_at')
    .in('job_id', jobs.map((job) => job.id))
    .order('started_at', { ascending: false })
  const latestRunByJob = new Map<string, ResearchRunRow>()
  for (const run of (runData ?? []) as ResearchRunRow[]) {
    if (!latestRunByJob.has(run.job_id)) latestRunByJob.set(run.job_id, run)
  }
  return jobs.map((job) => normalizeResearchJob(job, latestRunByJob.get(job.id)))
}

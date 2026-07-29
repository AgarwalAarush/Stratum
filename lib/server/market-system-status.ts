import { isUsMarketRefreshWindow } from '../markets/market-clock.ts'
import { AsyncTtlCache } from './async-ttl-cache.ts'
import { getSupabaseClient } from './supabase.ts'

const RUN_PAGE_SIZE = 1_000
const STATUS_CACHE_MS = 30_000
const FMP_PLAN_REQUESTS_PER_MINUTE = 300
const FMP_INTERNAL_REQUESTS_PER_MINUTE = 240
const FMP_TRAILING_BANDWIDTH_BYTES = 20 * 1024 * 1024 * 1024

interface AgentRunStatusRow {
  status: 'running' | 'succeeded' | 'failed'
  provider: string | null
  output: unknown
  error: string | null
  started_at: string
  finished_at: string | null
  worker_id: string
}

export interface MarketSystemStatus {
  generatedAt: string
  worker: {
    state: 'healthy' | 'quiet' | 'degraded'
    workerId: string | null
    lastRunAt: string | null
    expectedWithinMinutes: number
  }
  jobs: {
    last24Hours: number
    running: number
    succeeded: number
    failed: number
    recentFailures: Array<{ at: string; error: string }>
  }
  fmp: {
    requestsLast24Hours: number
    requestsTrailing30Days: number
    responseBytesTrailing30Days: number
    bandwidthPercent: number
    peakRecordedRequestsPerMinute: number
    internalRequestsPerMinute: number
    planRequestsPerMinute: number
    throttledRequestsTrailing30Days: number
  }
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function fmpUsage(row: AgentRunStatusRow) {
  const providerUsage = record(record(row.output).providerUsage)
  const usage = record(providerUsage.fmp)
  return {
    requests: Number(usage.requests) || 0,
    responseBytes: Number(usage.responseBytes) || 0,
    throttledRequests: Number(usage.throttledRequests) || 0,
    requestsInTrailingMinute: Number(usage.requestsInTrailingMinute) || 0,
  }
}

async function loadAgentRuns(since: string): Promise<AgentRunStatusRow[]> {
  const supabase = getSupabaseClient()
  if (!supabase) return []
  const rows: AgentRunStatusRow[] = []
  for (let from = 0; ; from += RUN_PAGE_SIZE) {
    const { data, error } = await supabase
      .from('agent_runs')
      .select('status,provider,output,error,started_at,finished_at,worker_id')
      .gte('started_at', since)
      .order('started_at', { ascending: false })
      .range(from, from + RUN_PAGE_SIZE - 1)
    if (error) throw new Error(`Unable to load worker status: ${error.message}`)
    const page = (data ?? []) as AgentRunStatusRow[]
    rows.push(...page)
    if (page.length < RUN_PAGE_SIZE) break
  }
  return rows
}

const systemStatusCache = new AsyncTtlCache<MarketSystemStatus>({ maxEntries: 1 })

export async function fetchMarketSystemStatus(now = new Date()): Promise<MarketSystemStatus | null> {
  if (!getSupabaseClient()) return null
  return systemStatusCache.get('latest', STATUS_CACHE_MS, async () => {
    const trailingStart = new Date(now.getTime() - 30 * 86_400_000).toISOString()
    const last24Hours = new Date(now.getTime() - 86_400_000).getTime()
    const runs = await loadAgentRuns(trailingStart)
    const recentRuns = runs.filter((run) => Date.parse(run.started_at) >= last24Hours)
    const latest = runs[0] ?? null
    const expectedWithinMinutes = isUsMarketRefreshWindow(now) ? 15 : 150
    const latestAgeMinutes = latest
      ? (now.getTime() - Date.parse(latest.finished_at ?? latest.started_at)) / 60_000
      : Infinity
    const recentFailures = recentRuns
      .filter((run) => run.status === 'failed' && run.error)
      .slice(0, 5)
      .map((run) => ({ at: run.finished_at ?? run.started_at, error: run.error! }))
    const usageRows = runs.map((run) => ({
      startedAt: Date.parse(run.started_at),
      ...fmpUsage(run),
    }))
    const requestsTrailing30Days = usageRows.reduce((sum, usage) => sum + usage.requests, 0)
    const responseBytesTrailing30Days = usageRows.reduce((sum, usage) => sum + usage.responseBytes, 0)

    return {
      generatedAt: now.toISOString(),
      worker: {
        state: latest?.status === 'failed'
          ? 'degraded'
          : latestAgeMinutes <= expectedWithinMinutes
            ? 'healthy'
            : 'quiet',
        workerId: latest?.worker_id ?? null,
        lastRunAt: latest?.finished_at ?? latest?.started_at ?? null,
        expectedWithinMinutes,
      },
      jobs: {
        last24Hours: recentRuns.length,
        running: recentRuns.filter((run) => run.status === 'running').length,
        succeeded: recentRuns.filter((run) => run.status === 'succeeded').length,
        failed: recentRuns.filter((run) => run.status === 'failed').length,
        recentFailures,
      },
      fmp: {
        requestsLast24Hours: usageRows
          .filter((usage) => usage.startedAt >= last24Hours)
          .reduce((sum, usage) => sum + usage.requests, 0),
        requestsTrailing30Days,
        responseBytesTrailing30Days,
        bandwidthPercent: responseBytesTrailing30Days / FMP_TRAILING_BANDWIDTH_BYTES * 100,
        peakRecordedRequestsPerMinute: Math.max(
          0,
          ...usageRows.map((usage) => usage.requestsInTrailingMinute),
        ),
        internalRequestsPerMinute: FMP_INTERNAL_REQUESTS_PER_MINUTE,
        planRequestsPerMinute: FMP_PLAN_REQUESTS_PER_MINUTE,
        throttledRequestsTrailing30Days: usageRows.reduce(
          (sum, usage) => sum + usage.throttledRequests,
          0,
        ),
      },
    }
  })
}

import { CURRENT_RESEARCH_CONTRACT_VERSION, hasCurrentResearchContract } from './research-contract.ts'

export const RESEARCH_JOB_TYPES = ['generate-company-research', 'event-refresh-company-research', 'generate-etf-research'] as const
export const PORTFOLIO_RESEARCH_MAX_AGE_MS = 35 * 86_400_000

export function researchActiveJobLimit(environment: Record<string, string | undefined> = process.env): number {
  const value = Number(environment.RESEARCH_ACTIVE_JOB_LIMIT ?? 4)
  return Number.isInteger(value) && value >= 1 && value <= 4 ? value : 4
}

export interface PortfolioResearchHolding {
  ownerId: string
  symbol: string
  instrumentType: 'equity' | 'etf'
  researchSupported: boolean
  unavailableReason?: string
}

export interface ResearchRolloutReport {
  id: string
  ownerId: string
  symbol: string
  instrumentType: 'equity' | 'etf'
  status: string
  generatedAt: string
  dataAsOf: string | null
  content: unknown
  packet?: unknown
}

export interface ResearchRolloutJob {
  id: string
  ownerId: string | null
  symbol: string | null
  status: string
  createdAt: string
  dedupeKey?: string | null
  researchRetryCount?: number
}

export interface PortfolioResearchBackfillPlan {
  contractVersion: number
  checkedAt: string
  activeResearchJobs: number
  activeLimit: number
  capacity: number
  completed: Array<PortfolioResearchHolding & { researchId: string; generatedAt: string; dataAsOf: string | null }>
  inProgress: Array<PortfolioResearchHolding & { jobId: string }>
  unavailable: PortfolioResearchHolding[]
  blocked: Array<PortfolioResearchHolding & { jobId: string; queueStatus: string }>
  pending: Array<PortfolioResearchHolding & { researchId: string | null; reason: 'missing_research' | 'contract_upgrade' | 'failed_research' | 'stale_research'; dedupeKey: string }>
  selected: PortfolioResearchBackfillPlan['pending']
}

/** Plan every holding, including funds. Queue capacity does not erase deferred work. */
export function planPortfolioResearchBackfill(input: {
  holdings: PortfolioResearchHolding[]
  reports: ResearchRolloutReport[]
  jobs: ResearchRolloutJob[]
  activeLimit?: number
  batchSize?: number
  now?: Date
}): PortfolioResearchBackfillPlan {
  const now = input.now ?? new Date()
  const activeLimit = Math.max(1, Math.min(4, Math.floor(input.activeLimit ?? 4)))
  const activeJobs = input.jobs.filter(job => job.status === 'queued' || job.status === 'running')
  const capacity = Math.max(0, activeLimit - activeJobs.length)
  const plan: PortfolioResearchBackfillPlan = {
    contractVersion: CURRENT_RESEARCH_CONTRACT_VERSION, checkedAt: now.toISOString(),
    activeResearchJobs: activeJobs.length, activeLimit, capacity,
    completed: [], inProgress: [], unavailable: [], blocked: [], pending: [], selected: [],
  }
  const seen = new Set<string>()
  for (const holding of [...input.holdings].sort((a, b) => a.ownerId.localeCompare(b.ownerId) || a.symbol.localeCompare(b.symbol))) {
    const key = `${holding.ownerId}:${holding.symbol}:${holding.instrumentType}`
    if (seen.has(key)) continue
    seen.add(key)
    if (!holding.researchSupported) { plan.unavailable.push(holding); continue }
    const report = input.reports.filter(note => note.ownerId === holding.ownerId && note.symbol === holding.symbol && note.instrumentType === holding.instrumentType)
      .sort((a, b) => b.generatedAt.localeCompare(a.generatedAt))[0]
    const age = report ? now.getTime() - Date.parse(report.generatedAt) : Number.NaN
    if (report?.status === 'complete' && hasCurrentResearchContract(report.content, report.packet) && Number.isFinite(age) && age >= 0 && age <= PORTFOLIO_RESEARCH_MAX_AGE_MS) {
      plan.completed.push({ ...holding, researchId: report.id, generatedAt: report.generatedAt, dataAsOf: report.dataAsOf })
      continue
    }
    const active = activeJobs.find(job => job.ownerId === holding.ownerId && job.symbol === holding.symbol)
    if (active) { plan.inProgress.push({ ...holding, jobId: active.id }); continue }
    const dedupeKey = `portfolio-contract-upgrade:v${CURRENT_RESEARCH_CONTRACT_VERSION}:${holding.ownerId}:${holding.instrumentType}:${holding.symbol}:${report?.id ?? 'missing'}`
    const blocked = input.jobs.find(job => job.dedupeKey === dedupeKey && (['blocked', 'cancelled'].includes(job.status) || (job.status === 'failed' && (job.researchRetryCount ?? 0) >= 2)))
    if (blocked) { plan.blocked.push({ ...holding, jobId: blocked.id, queueStatus: blocked.status === 'failed' ? 'retry_exhausted' : blocked.status }); continue }
    const reason = !report ? 'missing_research' : report.status !== 'complete' ? 'failed_research'
      : !hasCurrentResearchContract(report.content, report.packet) ? 'contract_upgrade' : 'stale_research'
    plan.pending.push({ ...holding, researchId: report?.id ?? null, reason,
      dedupeKey,
    })
  }
  plan.pending.sort((a, b) => {
    const order = { missing_research: 0, contract_upgrade: 1, failed_research: 2, stale_research: 3 }
    return order[a.reason] - order[b.reason] || a.symbol.localeCompare(b.symbol)
  })
  const batchSize = Math.max(1, Math.min(4, Math.floor(input.batchSize ?? activeLimit)))
  plan.selected = plan.pending.slice(0, Math.min(capacity, batchSize))
  return plan
}

import { ownershipResearchModel } from '../ai/config.ts'

export function isOwnershipResearchJob(type: string | undefined): boolean {
  return ['generate-company-research', 'generate-etf-research', 'event-refresh-company-research', 'generate-daily-recommendations'].includes(type ?? '')
}

/** Ownership model policy applies to its isolated process, never the supervisor. */
export function agentAttemptEnvironment(job: object, environment: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const { job_type: type, payload } = job as { job_type?: string; payload?: Record<string, unknown> }
  if (payload?.researchModel) {
    const authorization = payload.ownerRequestedCatchUp as { key?: unknown; date?: unknown; reason?: unknown } | undefined
    if (!['generate-company-research', 'generate-etf-research', 'generate-daily-recommendations'].includes(type ?? '')
    || payload.researchModel !== 'gpt-6.1-sol' || typeof authorization?.key !== 'string' || !authorization.key
    || typeof authorization.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(authorization.date)
    || typeof authorization.reason !== 'string' || authorization.reason.length < 8) {
      throw new Error('Invalid owner-requested research model override')
    }
  }
  if (!isOwnershipResearchJob(type)) return environment
  const model = typeof payload?.researchModel === 'string' ? payload.researchModel : ownershipResearchModel(environment)
  return { ...environment, STRATUM_OWNERSHIP_RESEARCH_MODEL: model, CODEX_SYNTHESIS_MODEL: model,
    STRATUM_MARKET_STANDARD_MODEL: model, STRATUM_MARKET_RESEARCH_MODEL: model }
}

export function ownerRequestedCatchUpAllowance(jobs: Array<{ payload: unknown }>, date: string): number {
  const approvals = new Map<string, Set<string>>()
  for (const job of jobs) {
    const payload = job.payload as { ownerRequestedCatchUp?: { key?: unknown; date?: unknown; jobIds?: unknown } } | null
    const approval = payload?.ownerRequestedCatchUp
    if (approval?.date !== date || typeof approval.key !== 'string' || !Array.isArray(approval.jobIds)) continue
    approvals.set(approval.key, new Set(approval.jobIds.filter((id): id is string => typeof id === 'string')))
  }
  return new Set([...approvals.values()].flatMap(ids => [...ids])).size
}

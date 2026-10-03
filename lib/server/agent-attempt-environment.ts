/** An explicit owner catch-up applies to its isolated process, never the supervisor. */
export function agentAttemptEnvironment(job: object, environment: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const { job_type: type, payload } = job as { job_type?: string; payload?: Record<string, unknown> }
  if (!payload?.researchModel) return environment
  const authorization = payload.ownerRequestedCatchUp as { key?: unknown; date?: unknown; reason?: unknown } | undefined
  if (!['generate-company-research', 'generate-etf-research', 'generate-daily-recommendations'].includes(type ?? '')
    || payload.researchModel !== 'gpt-6.1-sol' || typeof authorization?.key !== 'string' || !authorization.key
    || typeof authorization.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(authorization.date)
    || typeof authorization.reason !== 'string' || authorization.reason.length < 8) {
    throw new Error('Invalid owner-requested research model override')
  }
  return { ...environment, CODEX_SYNTHESIS_MODEL: payload.researchModel,
    STRATUM_MARKET_STANDARD_MODEL: payload.researchModel, STRATUM_MARKET_RESEARCH_MODEL: payload.researchModel }
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

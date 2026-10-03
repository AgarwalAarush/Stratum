import { executeAgentJob } from '../lib/server/agent-jobs.ts'
import { normalizeClaimedAgentJob } from '../lib/server/agent-job-contracts.ts'
import { safeWorkerError } from '../lib/server/worker-local-health.ts'

process.once('message', async job => {
  try {
    const claimed = normalizeClaimedAgentJob(job)
    if (!claimed) throw new Error('Invalid agent job envelope')
    const output = await executeAgentJob(claimed, async (progress, phase) => {
      process.send?.({ type: 'progress', progress, phase })
    })
    process.send?.({ type: 'result', output }, () => process.exit(0))
  } catch (error) {
    process.send?.({ type: 'error', error: safeWorkerError(error) }, () => process.exit(1))
  }
})
// A replaced supervisor must not leave an orphan writing into its old lease.
process.once('disconnect', () => {
  try { process.kill(-process.pid, 'SIGKILL') } catch { process.exit(1) }
})

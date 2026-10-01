import { executeAgentJob } from '../lib/server/agent-jobs.ts'
import { safeWorkerError } from '../lib/server/worker-local-health.ts'

process.once('message', async job => {
  try {
    const output = await executeAgentJob(job as Parameters<typeof executeAgentJob>[0], async (progress, phase) => {
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

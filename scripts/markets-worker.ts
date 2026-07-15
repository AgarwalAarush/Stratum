import { hostname } from 'node:os'
import { processOneAgentJob } from '../lib/server/agent-jobs.ts'

const POLL_INTERVAL_MS = Number(process.env.WORKER_POLL_INTERVAL_MS ?? 5_000)
const workerId = process.env.WORKER_ID ?? `${hostname()}:${process.pid}`
const runOnce = process.argv.includes('--once')
let stopping = false

process.on('SIGINT', () => { stopping = true })
process.on('SIGTERM', () => { stopping = true })

async function main() {
  do {
    try {
      const processed = await processOneAgentJob(workerId)
      if (runOnce) return
      if (!processed) await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
    } catch (error) {
      console.error(JSON.stringify({ level: 'error', workerId, error: error instanceof Error ? error.message : String(error) }))
      if (runOnce) throw error
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
    }
  } while (!stopping)
}

await main()

import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
const root = process.env.STRATUM_DATA_ROOT || '/Users/Shared/StratumData'
try {
  const state = JSON.parse(
    await readFile(join(root, 'health', 'worker.json'), 'utf8'),
  )
  const age = Date.now() - Date.parse(state.checkedAt)
  const healthy =
    state.status === 'healthy' &&
    Number.isFinite(age) &&
    age >= 0 &&
    age < 180000
  console.log(
    JSON.stringify({
      healthy,
      status: state.status,
      ageSeconds: Math.round(age / 1000),
      release: state.release,
    }),
  )
  if (!healthy) process.exitCode = 1
} catch {
  console.log(
    JSON.stringify({
      healthy: false,
      reason: 'Worker health evidence unavailable',
    }),
  )
  process.exitCode = 1
}

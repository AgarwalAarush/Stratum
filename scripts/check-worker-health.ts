import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { CURRENT_RESEARCH_CONTRACT_VERSION } from '../lib/markets/research-contract.ts'
const root = process.env.STRATUM_DATA_ROOT || '/Users/Shared/StratumData'
const requiredRelease = process.argv.find(argument => argument.startsWith('--required-release='))?.slice('--required-release='.length)
const requireResearchReadiness = process.argv.includes('--require-research-readiness')
try {
  const state = JSON.parse(
    await readFile(join(root, 'health', 'worker.json'), 'utf8'),
  )
  const age = Date.now() - Date.parse(state.checkedAt)
  const healthy =
    state.status === 'healthy' &&
    Number.isFinite(age) &&
    age >= 0 &&
    age < 180000 &&
    (!requiredRelease || state.release === requiredRelease) &&
    (!requireResearchReadiness || (state.database === 'ready' && state.readinessSchema === 'current'
      && state.researchContractVersion === CURRENT_RESEARCH_CONTRACT_VERSION))
  console.log(
    JSON.stringify({
      healthy,
      status: state.status,
      ageSeconds: Math.round(age / 1000),
      release: state.release,
      researchContractVersion: state.researchContractVersion ?? null,
      database: state.database ?? 'unverified',
      readinessSchema: state.readinessSchema ?? 'unknown',
      requiredRelease: requiredRelease ?? null,
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

import { fetchResearchWorkerReadiness } from '../lib/server/research-rollout.ts'

const requiredRelease = process.argv.find(argument => argument.startsWith('--required-release='))?.slice('--required-release='.length)
if (requiredRelease && !/^[0-9a-f]{40}$/i.test(requiredRelease)) throw new Error('--required-release must be an exact 40-character worker release SHA')
const readiness = await fetchResearchWorkerReadiness({ requiredRelease })
console.info(JSON.stringify(readiness, null, 2))
const databaseOnly = process.argv.includes('--database-only')
if (databaseOnly ? readiness.database !== 'ready' || readiness.readinessSchema !== 'current'
  : requiredRelease ? !readiness.readyForBackfill : !readiness.healthy) process.exitCode = 1

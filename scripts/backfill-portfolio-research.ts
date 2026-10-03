import { MARKETS_OWNER_ID } from '../lib/auth/markets-auth.ts'
import { enqueuePortfolioResearchBackfill } from '../lib/server/research-rollout.ts'

const option = (name: string) => process.argv.find(argument => argument.startsWith(`--${name}=`))?.slice(name.length + 3)
const requiredRelease = option('required-release') ?? ''
const batchSize = Number(option('batch-size') ?? 4)
if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 4) throw new Error('--batch-size must be between 1 and 4')
const result = await enqueuePortfolioResearchBackfill(option('owner') ?? MARKETS_OWNER_ID, {
  requiredRelease, batchSize, dryRun: !process.argv.includes('--execute'),
})
console.info(JSON.stringify(result, null, 2))
if (!result.readiness.readyForBackfill) process.exitCode = 1

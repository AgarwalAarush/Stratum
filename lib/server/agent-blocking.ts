import { createHash } from 'node:crypto'
import { inspectCorpusDisk } from './world-corpus.ts'

export function blockingReason(message: string): 'configuration' | 'capacity' | 'adapter' | 'retired' | null {
  if (/legacy belief writer retired/i.test(message)) return 'retired'
  if (/safety limit|insufficient.*disk|disk.*critical/i.test(message)) return 'capacity'
  if (/no.*adapter|unsupported.*adapter|adapter.*not.*configured|no.*holdings.*adapter/i.test(message)) return 'adapter'
  if (/not configured|credentials.*missing|missing.*credentials|spawn.*restic.*ENOENT/i.test(message)) return 'configuration'
  return null
}
export async function blockingFingerprint(reason: string): Promise<string> {
  if (reason === 'retired') return 'git-world-v1'
  const state = reason === 'capacity' ? { disk: (await inspectCorpusDisk()).state } : {
    release: process.env.STRATUM_RELEASE_SHA ?? 'unknown',
    configured: ['FMP_API_KEY','ALPACA_API_KEY_ID','ALPACA_API_SECRET_KEY','CODEX_API_KEY','OPENAI_API_KEY','RESTIC_REPOSITORY','RESTIC_PASSWORD_FILE'].map(k => [k, Boolean(process.env[k])]),
  }
  return createHash('sha256').update(JSON.stringify(state)).digest('hex')
}

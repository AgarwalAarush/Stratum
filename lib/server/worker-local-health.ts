import { mkdir, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { DEFAULT_MARKET_DATA_ROOT } from './world-corpus.ts'
export function safeWorkerError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  return /<!doctype|<html/i.test(message)
    ? 'Database gateway unavailable'
    : message.slice(0, 1000)
}
/** Independent of Supabase: an external host monitor can distinguish a live
 * failing worker from a dead process even while the database is unavailable. */
export async function writeWorkerLocalHealth(state: {
  workerId: string
  status: 'starting' | 'healthy' | 'degraded'
  consecutiveFailures: number
  error?: string
}) {
  const directory = join(
    process.env.STRATUM_DATA_ROOT || DEFAULT_MARKET_DATA_ROOT,
    'health',
  )
  await mkdir(directory, { recursive: true, mode: 0o700 })
  const target = join(directory, 'worker.json'),
    temporary = `${target}.${process.pid}.tmp`
  await writeFile(
    temporary,
    JSON.stringify({
      ...state,
      checkedAt: new Date().toISOString(),
      release: process.env.STRATUM_RELEASE_SHA ?? 'unknown',
    }),
    { mode: 0o600 },
  )
  await rename(temporary, target)
}

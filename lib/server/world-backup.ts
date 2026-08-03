import { spawn } from 'node:child_process'
import { join } from 'node:path'
import { DEFAULT_MARKET_DATA_ROOT, inspectCorpusDisk } from './world-corpus.ts'
import { getSupabaseClient } from './supabase.ts'

function corpusRoot(): string {
  return process.env.STRATUM_DATA_ROOT?.trim() || DEFAULT_MARKET_DATA_ROOT
}

function resticEnvironment(): NodeJS.ProcessEnv {
  return Object.fromEntries(Object.entries({
    PATH: process.env.PATH,
    RESTIC_REPOSITORY: process.env.RESTIC_REPOSITORY,
    RESTIC_PASSWORD_FILE: process.env.RESTIC_PASSWORD_FILE,
    AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID,
    AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY,
    AWS_DEFAULT_REGION: process.env.AWS_DEFAULT_REGION,
  }).filter((entry): entry is [string, string] => Boolean(entry[1]))) as NodeJS.ProcessEnv
}

async function runRestic(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.env.RESTIC_EXECUTABLE ?? 'restic', args, { env: resticEnvironment(), stdio: ['ignore', 'pipe', 'pipe'] })
    let output = ''
    child.stdout.on('data', (chunk: Buffer) => { output = `${output}${chunk}`.slice(-16_000) })
    child.stderr.on('data', (chunk: Buffer) => { output = `${output}${chunk}`.slice(-16_000) })
    child.on('error', reject)
    child.on('close', (code) => code === 0 ? resolve(output) : reject(new Error(`Restic exited ${code}: ${output}`)))
  })
}

async function record(kind: 'backup' | 'verify' | 'restore_drill', status: 'running' | 'succeeded' | 'failed', values: Record<string, unknown> = {}) {
  const supabase = getSupabaseClient()
  if (!supabase) return null
  if (status === 'running') {
    const { data } = await supabase.from('market_corpus_backup_runs').insert({ kind, status }).select('id').maybeSingle()
    return data?.id as string | undefined
  }
  if (typeof values.runId === 'string') {
    await supabase.from('market_corpus_backup_runs').update({
      status, snapshot_id: values.snapshotId ?? null, byte_count: values.byteCount ?? null, output: values.output ?? {}, error: values.error ?? null, finished_at: new Date().toISOString(),
    }).eq('id', values.runId)
  }
  return null
}

export async function backupMarketCorpus(): Promise<{ configured: boolean; output?: string }> {
  if (!process.env.RESTIC_REPOSITORY || !process.env.RESTIC_PASSWORD_FILE) return { configured: false }
  const runId = await record('backup', 'running')
  try {
    const root = corpusRoot()
    const disk = await inspectCorpusDisk()
    const output = await runRestic(['backup', '--tag', 'stratum-market-corpus', root])
    // Only a successful current backup is allowed to prune older snapshots.
    const retention = await runRestic([
      'forget', '--tag', 'stratum-market-corpus', '--keep-daily', '30', '--keep-weekly', '12', '--keep-monthly', '12', '--prune',
    ])
    const combinedOutput = `${output}\n${retention}`
    await record('backup', 'succeeded', { runId, byteCount: disk.managedBytes, output: { text: combinedOutput } })
    return { configured: true, output: combinedOutput }
  } catch (error) {
    await record('backup', 'failed', { runId, error: error instanceof Error ? error.message : String(error) })
    throw error
  }
}

export async function verifyMarketCorpusBackup(): Promise<{ configured: boolean; output?: string }> {
  if (!process.env.RESTIC_REPOSITORY || !process.env.RESTIC_PASSWORD_FILE) return { configured: false }
  const runId = await record('verify', 'running')
  try {
    const output = await runRestic(['check', '--read-data-subset=2.5%'])
    await record('verify', 'succeeded', { runId, output: { text: output } })
    return { configured: true, output }
  } catch (error) {
    await record('verify', 'failed', { runId, error: error instanceof Error ? error.message : String(error) })
    throw error
  }
}

export function marketCorpusArtifactPaths(): string[] {
  const root = corpusRoot()
  return [join(root, 'sources'), join(root, 'warehouse'), join(root, 'artifacts')]
}

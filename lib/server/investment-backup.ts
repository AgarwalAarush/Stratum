import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { getSupabaseClient } from './supabase.ts'

// Immutable financial artifacts only. Credentials and private OAuth stores are
// never copied into this export. Operational leases are reconstructed on restore.
export const INVESTMENT_BACKUP_TABLES = [
  'recommendation_input_manifests',
  'recommendation_batches',
  'recommendation_versions',
  'recommendation_forecasts',
  'recommendation_owner_events',
  'recommendation_evaluations',
  'recommendation_cohort_reviews',
  'recommendation_policy_experiments',
  'investment_newsletter_outbox',
  'investment_newsletter_events',
  'investment_price_vintages',
  'investment_macro_vintages',
  'investment_reconstruction_artifacts',
  'market_universe_vintages',
] as const
const digest = (s: string) => createHash('sha256').update(s).digest('hex')
export async function exportInvestmentLedger(root: string) {
  const db = getSupabaseClient()
  if (!db) throw new Error('Database required for ledger backup')
  const directory = join(
    root,
    'artifacts',
    'investment-ledger',
    `${new Date().toISOString().replaceAll(':', '-')}-${randomUUID()}`,
  )
  await mkdir(directory, { recursive: true, mode: 0o700 })
  const files: Array<{
    table: string
    file: string
    count: number
    sha256: string
  }> = []
  for (const table of INVESTMENT_BACKUP_TABLES) {
    const records: unknown[] = []
    let after: string | undefined
    for (;;) {
      let query = db.from(table).select('*').order('id').limit(500)
      if (after) query = query.gt('id', after)
      const result = await query
      if (result.error)
        throw new Error(`Ledger export ${table}: ${result.error.message}`)
      records.push(...result.data)
      if (result.data.length < 500) break
      after = String(result.data.at(-1).id)
    }
    const body = records.map((r) => JSON.stringify(r)).join('\n') + '\n',
      file = `${table}.jsonl`
    await writeFile(join(directory, file), body, { mode: 0o600, flag: 'wx' })
    files.push({ table, file, count: records.length, sha256: digest(body) })
  }
  // This export is a durable artifact archive, not a replacement for a
  // transactional database backup. Reconcile cross-table references on restore.
  await writeFile(
    join(directory, 'manifest.json'),
    JSON.stringify(
      {
        format: 1,
        createdAt: new Date().toISOString(),
        consistency:
          'Per-table immutable artifact export; use managed database backups for transactional recovery',
        files,
      },
      null,
      2,
    ),
    { mode: 0o600, flag: 'wx' },
  )
  return { directory, ...(await verifyInvestmentLedgerExport(directory)) }
}
export async function verifyInvestmentLedgerExport(directory: string) {
  const manifest = JSON.parse(
    await readFile(join(directory, 'manifest.json'), 'utf8'),
  )
  if (
    manifest.format !== 1 ||
    !Array.isArray(manifest.files) ||
    manifest.files.length !== INVESTMENT_BACKUP_TABLES.length
  )
    throw new Error('Invalid ledger export manifest')
  let records = 0
  for (const table of INVESTMENT_BACKUP_TABLES) {
    const file = manifest.files.find(
      (f: { table: string }) => f.table === table,
    )
    if (!file || file.file !== `${table}.jsonl`)
      throw new Error('Missing or unsafe ledger export path')
    const body = await readFile(join(directory, file.file), 'utf8')
    if (digest(body) !== file.sha256)
      throw new Error(`Ledger export checksum mismatch: ${table}`)
    const rows = body.trim()
      ? body
          .trim()
          .split('\n')
          .map((line) => JSON.parse(line))
      : []
    if (
      rows.length !== file.count ||
      rows.some((r) => !r.id) ||
      new Set(rows.map((r) => r.id)).size !== rows.length
    )
      throw new Error(`Ledger export row mismatch: ${table}`)
    records += rows.length
  }
  return { verified: true, records, tables: INVESTMENT_BACKUP_TABLES.length }
}
export async function verifyRestoredLedgerArchives(root: string) {
  const directory = join(root, 'artifacts', 'investment-ledger')
  const entries = await readdir(directory, { withFileTypes: true })
  const latest = entries
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort()
    .at(-1)
  if (!latest)
    throw new Error('Restored snapshot contains no investment ledger export')
  return verifyInvestmentLedgerExport(join(directory, latest))
}

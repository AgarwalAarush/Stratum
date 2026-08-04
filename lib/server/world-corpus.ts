import { createHash } from 'node:crypto'
import { mkdir, readdir, readFile, stat, statfs, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

export const DEFAULT_MARKET_DATA_ROOT = '/Users/Shared/StratumData'
const MIN_FREE_BYTES = 40 * 1024 ** 3
const OPTIONAL_STOP_FREE_BYTES = 50 * 1024 ** 3
const MAX_MANAGED_BYTES = 120 * 1024 ** 3

export interface CorpusDiskState {
  availableBytes: number
  managedBytes: number
  state: 'healthy' | 'optional_paused' | 'critical'
}

export interface WorldCorpusDocumentInput {
  body: string | Buffer
  /**
   * Readable extraction of `body`. The raw bytes are always archived unchanged;
   * this is deliberately separate so an HTML or PDF source is not mistaken for
   * its analyst-facing text representation.
   */
  extractedText?: string
  extension?: string
  mimeType?: string
  title: string
  canonicalUrl: string
  publisher: string
  domain: string
  publishedAt?: string | null
}

export interface StoredWorldCorpusDocument {
  contentHash: string
  archiveKey: string
  extractedKey: string
  byteCount: number
}

function dataRoot(environment: NodeJS.ProcessEnv = process.env): string {
  return environment.STRATUM_DATA_ROOT?.trim() || DEFAULT_MARKET_DATA_ROOT
}

function corpusPath(key: string, environment: NodeJS.ProcessEnv = process.env): string {
  const root = dataRoot(environment)
  const resolved = join(root, key)
  // Archive keys originate in this module. Keep the extra boundary here because
  // research jobs read paths returned from persisted metadata.
  if (!resolved.startsWith(`${root}/`)) throw new Error('Invalid market corpus key')
  return resolved
}

function safePathPart(value: string): string {
  const cleaned = value.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '')
  return cleaned || 'general'
}

function quotedPath(path: string): string {
  return `'${path.replaceAll("'", "''")}'`
}

async function directoryBytes(path: string): Promise<number> {
  try {
    const entry = await stat(path)
    if (!entry.isDirectory()) return entry.size
    const children = await readdir(path, { withFileTypes: true })
    const sizes = await Promise.all(children.map(async (child) => {
      // The corpus never follows symlinks: a local archive must not accidentally
      // account for or traverse files outside STRATUM_DATA_ROOT.
      if (child.isSymbolicLink()) return 0
      return directoryBytes(join(path, child.name))
    }))
    return sizes.reduce((total, value) => total + value, 0)
  } catch {
    return 0
  }
}

export async function inspectCorpusDisk(environment: NodeJS.ProcessEnv = process.env): Promise<CorpusDiskState> {
  const root = dataRoot(environment)
  await mkdir(root, { recursive: true, mode: 0o700 })
  const [filesystem, rootStat] = await Promise.all([statfs(root), directoryBytes(root)])
  const availableBytes = Number(filesystem.bavail) * Number(filesystem.bsize)
  const managedBytes = rootStat
  const state = availableBytes < MIN_FREE_BYTES || managedBytes >= MAX_MANAGED_BYTES
    ? 'critical'
    : availableBytes < OPTIONAL_STOP_FREE_BYTES
      ? 'optional_paused'
      : 'healthy'
  return { availableBytes, managedBytes, state }
}

export async function storeWorldCorpusDocument(
  input: WorldCorpusDocumentInput,
  environment: NodeJS.ProcessEnv = process.env,
): Promise<StoredWorldCorpusDocument> {
  const disk = await inspectCorpusDisk(environment)
  if (disk.state === 'critical' && environment.STRATUM_CORPUS_TEST_MODE !== 'true') {
    throw new Error('Market corpus is at its safety limit; non-critical document ingestion is paused')
  }
  const root = dataRoot(environment)
  const bytes = Buffer.isBuffer(input.body) ? input.body : Buffer.from(input.body, 'utf8')
  const contentHash = createHash('sha256').update(bytes).digest('hex')
  const extension = safePathPart(input.extension?.replace(/^\./, '') || 'txt')
  const archiveKey = `sources/raw/${contentHash.slice(0, 2)}/${contentHash}.${extension}`
  const extractedKey = `sources/extracted/${contentHash}.md`
  const archivePath = join(root, archiveKey)
  const extractedPath = join(root, extractedKey)
  await Promise.all([
    mkdir(dirname(archivePath), { recursive: true, mode: 0o700 }),
    mkdir(dirname(extractedPath), { recursive: true, mode: 0o700 }),
  ])
  try {
    await stat(archivePath)
  } catch {
    await writeFile(archivePath, bytes, { mode: 0o600 })
  }
  try {
    await stat(extractedPath)
  } catch {
    const text = input.extractedText ?? (Buffer.isBuffer(input.body) ? input.body.toString('utf8') : input.body)
    const metadata = [
      `# ${input.title}`,
      '',
      `Source: ${input.publisher}`,
      `URL: ${input.canonicalUrl}`,
      `Domain: ${input.domain}`,
      input.publishedAt ? `Published: ${input.publishedAt}` : null,
      '',
      text,
    ].filter((line): line is string => line !== null).join('\n')
    await writeFile(extractedPath, metadata, { mode: 0o600 })
  }
  return { contentHash, archiveKey, extractedKey, byteCount: bytes.byteLength }
}

/** Read a bounded, extracted source excerpt for a private research job. */
export async function readWorldCorpusExtract(
  extractedKey: string,
  maxCharacters = 12_000,
  environment: NodeJS.ProcessEnv = process.env,
): Promise<string> {
  if (!extractedKey.startsWith('sources/extracted/') || !extractedKey.endsWith('.md')) {
    throw new Error('Invalid market corpus extract key')
  }
  const content = await readFile(corpusPath(extractedKey, environment), 'utf8')
  return content.slice(0, Math.max(1, Math.min(maxCharacters, 40_000)))
}

interface WarehouseObservation {
  id: string
  domain: string
  mechanism: string
  assertion: string
  publishedAt: string | null
  ingestedAt: string
  confidence: number
  materiality: number
}

let writeChain = Promise.resolve()
const runtimeRequire = createRequire(import.meta.url)

function loadDuckDb(): typeof import('@duckdb/node-api') {
  // Keep the native module strictly in the private worker runtime. Next/Vercel
  // can render and serve persisted artifacts without attempting to bundle a
  // platform-specific .node binary.
  const packageName = ['@duckdb', 'node-api'].join('/')
  return runtimeRequire(packageName) as typeof import('@duckdb/node-api')
}

export async function mirrorObservationToWarehouse(
  observation: WarehouseObservation,
  environment: NodeJS.ProcessEnv = process.env,
): Promise<{ parquetKey: string; ftsIndexed: boolean }> {
  const root = dataRoot(environment)
  const date = new Date(observation.publishedAt ?? observation.ingestedAt)
  const year = Number.isFinite(date.getTime()) ? String(date.getUTCFullYear()) : 'unknown'
  const month = Number.isFinite(date.getTime()) ? String(date.getUTCMonth() + 1).padStart(2, '0') : '00'
  const domain = safePathPart(observation.domain)
  const parquetKey = `warehouse/observations/domain=${domain}/year=${year}/month=${month}/${observation.id}.parquet`
  const databasePath = join(root, 'warehouse/stratum.duckdb')
  const parquetPath = join(root, parquetKey)
  const run = async () => {
    await mkdir(dirname(parquetPath), { recursive: true, mode: 0o700 })
    const { DuckDBInstance } = loadDuckDb()
    const instance = await DuckDBInstance.fromCache(databasePath, { threads: '3' })
    const connection = await instance.connect()
    try {
      await connection.run(`create table if not exists world_observation_warehouse (
        id varchar primary key, domain varchar, mechanism varchar, assertion varchar,
        published_at varchar, ingested_at varchar, confidence double, materiality double
      )`)
      await connection.run(
        `insert into world_observation_warehouse values ($id, $domain, $mechanism, $assertion, $publishedAt, $ingestedAt, $confidence, $materiality)
         on conflict(id) do update set assertion = excluded.assertion, confidence = excluded.confidence, materiality = excluded.materiality`,
        observation as unknown as Record<string, import('@duckdb/node-api').DuckDBValue>,
      )
      await connection.run(
        `copy (select * from world_observation_warehouse where id = $id) to ${quotedPath(parquetPath)} (format parquet, compression zstd)`,
        { id: observation.id },
      )
      let ftsIndexed = false
      try {
        await connection.run('load fts')
        await connection.run("pragma drop_fts_index('world_observation_warehouse')")
        await connection.run("pragma create_fts_index('world_observation_warehouse', 'id', 'assertion', 'mechanism', 'domain')")
        ftsIndexed = true
      } catch {
        // Corpus durability does not depend on the optional search extension.
      }
      return { parquetKey, ftsIndexed }
    } finally {
      connection.closeSync()
    }
  }
  const result = writeChain.then(run, run)
  writeChain = result.then(() => undefined, () => undefined)
  return result
}

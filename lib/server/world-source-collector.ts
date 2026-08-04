import { parseHTML } from 'linkedom'
import type { WorldSourceContract, WorldSourceRegistryEntry } from '../markets/types.ts'
import { storeWorldCorpusDocument } from './world-corpus.ts'
import { fetchActiveMarketDomainPacks, fetchWorldSourceControlWorkspace, resolveApprovedWorldSource } from './world-source-control.ts'
import { getSupabaseClient } from './supabase.ts'

const FETCH_TIMEOUT_MS = 30_000
const MAX_DOCUMENT_BYTES = 25 * 1024 * 1024
const MAX_REDIRECTS = 4
const SOURCE_HEADERS = {
  'User-Agent': 'StratumMarketMemory/1.0 (+private research worker)',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,application/pdf;q=0.8,application/json;q=0.7,text/csv;q=0.7,*/*;q=0.5',
}

export interface GovernedSourceFetchTarget {
  source: WorldSourceRegistryEntry
  contract: WorldSourceContract
  domainIds: string[]
}

export interface FetchedGovernedDocument {
  resolvedUrl: string
  httpStatus: number
  mimeType: string
  body: Buffer
}

export interface WorldSourceCollectionResult {
  captured: number
  rejected: number
  failed: number
  captureIds: string[]
}

function urlAllowed(contract: WorldSourceContract, value: string): boolean {
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:') return false
    const allowedHost = contract.allowedHosts.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`))
    return allowedHost && (contract.allowedPaths.length === 0 || contract.allowedPaths.some((path) => url.pathname.startsWith(path)))
  } catch {
    return false
  }
}

function mimeAllowed(contract: WorldSourceContract, mimeType: string): boolean {
  return contract.acceptedMimeTypes.length === 0 || contract.acceptedMimeTypes.some((allowed) => mimeType.startsWith(allowed))
}

function normalizedMime(response: Response): string {
  return response.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase() || 'application/octet-stream'
}

function extension(mimeType: string): string {
  if (mimeType.includes('pdf')) return 'pdf'
  if (mimeType.includes('json')) return 'json'
  if (mimeType.includes('csv')) return 'csv'
  if (mimeType.includes('xml')) return 'xml'
  return 'html'
}

function sourceTitle(source: WorldSourceRegistryEntry, body: Buffer, mimeType: string): string {
  if (!/html|xml/i.test(mimeType)) return source.label
  try {
    const { document } = parseHTML(body.toString('utf8'))
    return document.title?.replace(/\s+/g, ' ').trim().slice(0, 500) || source.label
  } catch {
    return source.label
  }
}

async function extractedText(body: Buffer, mimeType: string): Promise<{ text: string; complete: boolean }> {
  if (mimeType.includes('pdf')) {
    try {
      const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs') as {
        getDocument: (options: { data: Uint8Array }) => { promise: Promise<{ numPages: number; getPage: (page: number) => Promise<{ getTextContent: () => Promise<{ items: Array<{ str?: string }> }> }> }> }
      }
      const document = await pdfjs.getDocument({ data: new Uint8Array(body) }).promise
      const pages = await Promise.all(Array.from({ length: document.numPages }, async (_, index) => {
        const page = await document.getPage(index + 1)
        const content = await page.getTextContent()
        return content.items.map((item) => item.str ?? '').join(' ')
      }))
      return { text: pages.join('\n').replace(/\s+/g, ' ').trim(), complete: true }
    } catch {
      return { text: '[PDF text extraction failed; consult the immutable raw archive.]', complete: false }
    }
  }
  if (!/html|xml/i.test(mimeType)) return { text: body.toString('utf8').replace(/\s+/g, ' ').trim(), complete: true }
  try {
    const { document } = parseHTML(body.toString('utf8'))
    document.querySelectorAll('script,style,noscript,svg,nav,footer,header').forEach((node) => node.remove())
    return { text: (document.querySelector('article, main')?.textContent ?? document.body?.textContent ?? '')
      .replace(/\s+/g, ' ').trim(), complete: true }
  } catch {
    return { text: body.toString('utf8').replace(/\s+/g, ' ').trim(), complete: false }
  }
}

async function boundedBody(response: Response): Promise<Buffer> {
  const declared = Number(response.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > MAX_DOCUMENT_BYTES) throw new Error(`Response exceeds ${MAX_DOCUMENT_BYTES} byte collection limit`)
  if (!response.body) return Buffer.alloc(0)
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const next = await reader.read()
      if (next.done) break
      size += next.value.byteLength
      if (size > MAX_DOCUMENT_BYTES) throw new Error(`Response exceeds ${MAX_DOCUMENT_BYTES} byte collection limit`)
      chunks.push(next.value)
    }
  } finally {
    reader.releaseLock()
  }
  return Buffer.concat(chunks)
}

/** Fetches only contract-permitted URLs and validates every redirect before it
 * is followed. It captures bytes but deliberately makes no factual assertion. */
export async function fetchGovernedSourceDocument(
  target: Pick<GovernedSourceFetchTarget, 'source' | 'contract'>,
  options: { fetchImpl?: typeof fetch; timeoutMs?: number } = {},
): Promise<FetchedGovernedDocument> {
  const fetchImpl = options.fetchImpl ?? fetch
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? FETCH_TIMEOUT_MS)
  let currentUrl = target.source.canonicalUrl
  try {
    for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
      if (!urlAllowed(target.contract, currentUrl)) throw new Error('Collection URL is outside the active source contract')
      const response = await fetchImpl(currentUrl, { headers: SOURCE_HEADERS, redirect: 'manual', signal: controller.signal })
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location')
        if (!location) throw new Error(`Redirect ${response.status} did not include a location`)
        currentUrl = new URL(location, currentUrl).toString()
        continue
      }
      const mimeType = normalizedMime(response)
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      if (!mimeAllowed(target.contract, mimeType)) throw new Error(`Response MIME type ${mimeType} is outside the active source contract`)
      const body = await boundedBody(response)
      if (body.byteLength === 0) throw new Error('Response body is empty')
      return { resolvedUrl: currentUrl, httpStatus: response.status, mimeType, body }
    }
    throw new Error(`Source exceeded ${MAX_REDIRECTS} permitted redirects`)
  } finally {
    clearTimeout(timeout)
  }
}

export function isSourceCollectionDue(cadence: WorldSourceContract['cadence'], now = new Date()): boolean {
  if (cadence === 'event') return false
  if (cadence === 'daily') return true
  if (cadence === 'weekly') return now.getUTCDay() === 0
  return now.getUTCDate() === 1
}

/** An approved non-event source receives one prompt immutable capture after
 * admission. Subsequent collection follows its contracted cadence, so a
 * weekly filing admitted on Monday does not sit unevidenced until Sunday. */
export function shouldCollectGovernedSource(
  cadence: WorldSourceContract['cadence'],
  hasCaptureForActiveContract: boolean,
  now = new Date(),
): boolean {
  return cadence !== 'event' && (!hasCaptureForActiveContract || isSourceCollectionDue(cadence, now))
}

async function fetchCollectionTargets(now: Date): Promise<GovernedSourceFetchTarget[]> {
  const [workspace, activePacks] = await Promise.all([fetchWorldSourceControlWorkspace(), fetchActiveMarketDomainPacks()])
  const activeDomainIds = new Set(activePacks.map((pack) => pack.id))
  const eligible: GovernedSourceFetchTarget[] = []
  for (const source of workspace.sources) {
    if (source.status !== 'approved' && source.status !== 'probation') continue
    const domainIds = source.domainIds.filter((id) => activeDomainIds.has(id))
    if (domainIds.length === 0) continue
    const { contract } = await resolveApprovedWorldSource(source.slug, source.canonicalUrl)
    eligible.push({ source, contract, domainIds })
  }
  if (eligible.length === 0) return []
  const supabase = getSupabaseClient()
  if (!supabase) throw new Error('Supabase service credentials are not configured')
  const { data: captures, error } = await supabase.from('world_source_document_captures')
    .select('source_id,contract_version').in('source_id', eligible.map((target) => target.source.id))
  if (error) throw new Error(`Unable to determine source collection coverage: ${error.message}`)
  const capturedContracts = new Set((captures ?? []).map((capture) => `${String(capture.source_id)}:${Number(capture.contract_version)}`))
  const targets = eligible.filter((target) => shouldCollectGovernedSource(
    target.contract.cadence,
    capturedContracts.has(`${target.source.id}:${target.contract.version}`),
    now,
  ))
  return targets.sort((left, right) => left.source.slug.localeCompare(right.source.slug))
}

async function persistCapture(
  target: GovernedSourceFetchTarget,
  input: { status: 'captured' | 'rejected' | 'failed'; documentId?: string | null; resolvedUrl?: string | null; httpStatus?: number | null; mimeType?: string | null; contentHash?: string | null; byteCount?: number | null; error?: string | null },
): Promise<string> {
  const supabase = getSupabaseClient()
  if (!supabase) throw new Error('Supabase service credentials are not configured')
  const { data, error } = await supabase.from('world_source_document_captures').insert({
    source_id: target.source.id, document_id: input.documentId ?? null, domain_ids: target.domainIds,
    contract_version: target.contract.version, status: input.status, canonical_url: target.source.canonicalUrl,
    resolved_url: input.resolvedUrl ?? null, http_status: input.httpStatus ?? null, mime_type: input.mimeType ?? null,
    content_hash: input.contentHash ?? null, byte_count: input.byteCount ?? null, error: input.error ?? null,
  }).select('id').single()
  if (error || !data) throw new Error(`Unable to persist source document capture: ${error?.message ?? 'unknown error'}`)
  return String(data.id)
}

async function persistCapturedDocument(target: GovernedSourceFetchTarget, fetched: FetchedGovernedDocument): Promise<{ captureId: string }> {
  const extraction = await extractedText(fetched.body, fetched.mimeType)
  const title = sourceTitle(target.source, fetched.body, fetched.mimeType)
  const stored = await storeWorldCorpusDocument({
    body: fetched.body, extractedText: extraction.text, extension: extension(fetched.mimeType), mimeType: fetched.mimeType,
    title, canonicalUrl: fetched.resolvedUrl, publisher: target.source.publisher,
    domain: target.domainIds[0]!,
  })
  const supabase = getSupabaseClient()
  if (!supabase) throw new Error('Supabase service credentials are not configured')
  let documentId: string
  const document = {
    content_hash: stored.contentHash, canonical_url: fetched.resolvedUrl, title,
    publisher: target.source.publisher, source_registry_id: target.source.id, source_tier: target.source.sourceTier,
    mime_type: fetched.mimeType, archive_key: stored.archiveKey, extracted_key: stored.extractedKey, extraction_status: extraction.complete ? 'complete' : 'failed',
    backup_state: process.env.RESTIC_REPOSITORY ? 'pending' : 'not_configured', metadata: { byteCount: stored.byteCount, sourceDomains: target.domainIds, sourceContractVersion: target.contract.version, extractionComplete: extraction.complete },
  }
  const { data: inserted, error: insertError } = await supabase.from('world_documents')
    .upsert(document, { onConflict: 'content_hash', ignoreDuplicates: true }).select('id').maybeSingle()
  if (insertError) throw new Error(`Unable to persist collected world document: ${insertError.message}`)
  if (inserted) documentId = String(inserted.id)
  else {
    const { data: existing, error: existingError } = await supabase.from('world_documents').select('id').eq('content_hash', stored.contentHash).maybeSingle()
    if (existingError || !existing) throw new Error(`Unable to resolve collected world document: ${existingError?.message ?? 'unknown error'}`)
    documentId = String(existing.id)
  }
  return { captureId: await persistCapture(target, { status: 'captured', documentId, resolvedUrl: fetched.resolvedUrl, httpStatus: fetched.httpStatus, mimeType: fetched.mimeType, contentHash: stored.contentHash, byteCount: stored.byteCount }) }
}

/** Worker-only, bounded collection for admitted sources. The result is raw,
 * immutable source material plus provenance; it does not generate observations
 * or make a market inference. */
export async function collectGovernedWorldSourceDocuments(options: { now?: Date; fetchImpl?: typeof fetch; limit?: number } = {}): Promise<WorldSourceCollectionResult> {
  const targets = (await fetchCollectionTargets(options.now ?? new Date())).slice(0, Math.max(1, Math.min(50, options.limit ?? 24)))
  const output: WorldSourceCollectionResult = { captured: 0, rejected: 0, failed: 0, captureIds: [] }
  for (const target of targets) {
    try {
      const fetched = await fetchGovernedSourceDocument(target, { fetchImpl: options.fetchImpl })
      const result = await persistCapturedDocument(target, fetched)
      output.captured += 1
      output.captureIds.push(result.captureId)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const rejected = /outside the active source contract|Response MIME type|permitted redirects/.test(message)
      output[rejected ? 'rejected' : 'failed'] += 1
      output.captureIds.push(await persistCapture(target, { status: rejected ? 'rejected' : 'failed', error: message }))
    }
  }
  return output
}

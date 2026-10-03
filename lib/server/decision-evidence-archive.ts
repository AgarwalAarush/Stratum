import { createHash } from 'node:crypto'
import { gzipSync, gunzipSync } from 'node:zlib'

type Row = Record<string, unknown>
const row = (value: unknown): Row | null => value && typeof value === 'object' && !Array.isArray(value) ? value as Row : null
const hash = (value: Buffer) => createHash('sha256').update(value).digest('hex')
const MAX_TEXT_BYTES = 32 * 1024 * 1024

function capturedDocument(value: unknown, restore: boolean, texts: Row): unknown {
  const document = row(value)
  if (!document) return value
  const archive = row(document.frozenTextArchive)
  if (restore && archive) {
    if (!['gzip-base64-v1','gzip-base64-ref-v1'].includes(String(archive.encoding)) || !Number.isInteger(archive.bytes) || Number(archive.bytes) <= 0 || Number(archive.bytes) > MAX_TEXT_BYTES || typeof archive.sha256 !== 'string') throw new Error('Invalid frozen document text archive')
    const payload = archive.encoding === 'gzip-base64-ref-v1' ? row(texts[archive.sha256]) : archive
    if (!payload || payload.encoding !== 'gzip-base64-v1' || payload.bytes !== archive.bytes || payload.sha256 !== archive.sha256 || typeof payload.data !== 'string') throw new Error('Frozen document text integrity check failed: missing or mismatched payload')
    const bytes = gunzipSync(Buffer.from(payload.data, 'base64'), { maxOutputLength: Number(archive.bytes) })
    if (bytes.length !== archive.bytes || hash(bytes) !== archive.sha256) throw new Error('Frozen document text integrity check failed')
    const { frozenTextArchive: _archive, ...metadata } = document
    void _archive
    return { ...metadata, text: bytes.toString('utf8') }
  }
  if (restore || archive || typeof document.text !== 'string') return value
  const bytes = Buffer.from(document.text, 'utf8')
  if (bytes.length < 8192 || bytes.length > MAX_TEXT_BYTES) return value
  const data = gzipSync(bytes).toString('base64')
  if (data.length + 256 >= bytes.length) return value
  const sha256 = hash(bytes)
  texts[sha256] = { encoding: 'gzip-base64-v1', data, bytes: bytes.length, sha256 }
  return { ...document, text: null, frozenTextArchive: { encoding: 'gzip-base64-ref-v1', bytes: bytes.length, sha256 } }
}

/** Only captured text is archived. Facts, topic quotes, gaps and provenance stay
 * directly readable; immutable packet storage and historical reports are untouched. */
function evidenceValue(value: unknown, restore: boolean): unknown {
  const evidence = row(value), packet = row(evidence?.packet)
  if (!evidence || !packet) return value
  const pool = row(evidence.frozenDocumentTexts)
  if (!restore && pool) return value
  if (restore && pool && (pool.version !== 1 || !row(pool.texts))) throw new Error('Invalid frozen document text pool')
  const texts: Row = restore ? row(pool?.texts) ?? {} : {}
  const coverage = row(packet.researchCoverage)
  const { frozenDocumentTexts: _pool, ...metadata } = evidence
  void _pool
  const restored = { ...metadata, packet: { ...packet,
    ...(Array.isArray(packet.researchDocuments) ? { researchDocuments: packet.researchDocuments.map(d => capturedDocument(d, restore, texts)) } : {}),
    ...(coverage && Array.isArray(coverage.documents) ? { researchCoverage: { ...coverage, documents: coverage.documents.map(d => capturedDocument(d, restore, texts)) } } : {}),
  } }
  return !restore && Object.keys(texts).length ? { ...restored, frozenDocumentTexts: {version:1,texts} } : restored
}

export const archiveDecisionEvidence = (value: unknown) => evidenceValue(value, false)
export const restoreDecisionEvidence = (value: unknown) => evidenceValue(value, true)

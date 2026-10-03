import { createHash } from 'node:crypto'
import { gzipSync, gunzipSync } from 'node:zlib'

type Row = Record<string, unknown>
const row = (value: unknown): Row | null => value && typeof value === 'object' && !Array.isArray(value) ? value as Row : null
const hash = (value: Buffer) => createHash('sha256').update(value).digest('hex')
const MAX_TEXT_BYTES = 32 * 1024 * 1024

function capturedDocument(value: unknown, restore: boolean): unknown {
  const document = row(value)
  if (!document) return value
  const archive = row(document.frozenTextArchive)
  if (restore && archive) {
    if (archive.encoding !== 'gzip-base64-v1' || typeof archive.data !== 'string' || !Number.isInteger(archive.bytes) || Number(archive.bytes) <= 0 || Number(archive.bytes) > MAX_TEXT_BYTES || typeof archive.sha256 !== 'string') throw new Error('Invalid frozen document text archive')
    const bytes = gunzipSync(Buffer.from(archive.data, 'base64'), { maxOutputLength: Number(archive.bytes) })
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
  return { ...document, text: null, frozenTextArchive: { encoding: 'gzip-base64-v1', data, bytes: bytes.length, sha256: hash(bytes) } }
}

/** Only captured text is archived. Facts, topic quotes, gaps and provenance stay
 * directly readable; immutable packet storage and historical reports are untouched. */
function capturedPacket(value: unknown, restore: boolean): unknown {
  const packet = row(value)
  if (!packet) return value
  const coverage = row(packet.researchCoverage)
  return { ...packet,
    ...(Array.isArray(packet.researchDocuments) ? { researchDocuments: packet.researchDocuments.map(d => capturedDocument(d, restore)) } : {}),
    ...(coverage && Array.isArray(coverage.documents) ? { researchCoverage: { ...coverage, documents: coverage.documents.map(d => capturedDocument(d, restore)) } } : {}),
  }
}

function evidenceValue(value: unknown, restore: boolean): unknown {
  const evidence = row(value)
  if (!evidence || !row(evidence.packet)) return value
  // Frozen packet rows retain their original content as well as the authority
  // projection. Archive both copies; restoring either must reproduce its hash.
  return { ...evidence, packet: capturedPacket(evidence.packet, restore),
    ...(row(evidence.content) ? { content: capturedPacket(evidence.content, restore) } : {}),
  }
}

export const archiveDecisionEvidence = (value: unknown) => evidenceValue(value, false)
export const restoreDecisionEvidence = (value: unknown) => evidenceValue(value, true)

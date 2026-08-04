import { createHash } from 'node:crypto'
import type { WorldObservationKind, WorldSourceContract } from '../markets/types.ts'
import { getMarketDomainPack } from '../markets/domain-packs.ts'
import { runCodexJson, type CodexExecResult } from './codex-exec.ts'
import { selectMarketModel } from './market-model-policy.ts'
import { readWorldCorpusExtract } from './world-corpus.ts'
import { resolveApprovedWorldSource } from './world-source-control.ts'
import { getSupabaseClient } from './supabase.ts'

type RecordValue = Record<string, unknown>
const OBSERVATION_KINDS = new Set<WorldObservationKind>(['fact', 'estimate', 'claim', 'inference'])

function record(value: unknown): RecordValue {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as RecordValue : {}
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`Missing ${label}`)
  return value.trim()
}

function integerScore(value: unknown, label: string): number {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 100) throw new Error(`Invalid ${label}`)
  return parsed
}

function normalizedText(value: string): string {
  return value.toLocaleLowerCase().replace(/\s+/g, ' ').trim()
}

export interface WorldObservationProposalContent {
  proposals: Array<{
    assertion: string
    kind: WorldObservationKind
    mechanism: string
    evidenceQuote: string
    confidence: number
    materiality: number
    novelty: number
  }>
}

/** Validate cheap-model output against the exact extracted source text and the
 * declarative domain pack. A quote must occur verbatim in the supplied source;
 * this is intentionally stricter than a semantic similarity check. */
export function validateWorldObservationProposals(
  value: unknown,
  options: { domainId: string; contract: Pick<WorldSourceContract, 'assertionsAllowed'>; extractedText: string },
): WorldObservationProposalContent {
  const domain = getMarketDomainPack(options.domainId)
  if (!domain) throw new Error(`Unknown proposal domain ${options.domainId}`)
  const raw = record(value)
  const proposals = Array.isArray(raw.proposals) ? raw.proposals : []
  if (proposals.length < 1 || proposals.length > 6) throw new Error('Observation triage must return 1-6 proposals')
  const sourceText = normalizedText(options.extractedText)
  const seen = new Set<string>()
  return {
    proposals: proposals.map((rawProposal) => {
      const proposal = record(rawProposal)
      const assertion = requiredString(proposal.assertion, 'proposal assertion')
      if (assertion.length > 700) throw new Error('Proposal assertion exceeds limit')
      const kind = proposal.kind as WorldObservationKind
      if (!OBSERVATION_KINDS.has(kind) || !options.contract.assertionsAllowed.includes(kind)) throw new Error(`Source contract does not permit proposal kind ${String(proposal.kind)}`)
      const mechanism = requiredString(proposal.mechanism, 'proposal mechanism')
      if (!domain.mechanisms.some((item) => item.id === mechanism)) throw new Error(`Proposal mechanism ${mechanism} is not declared by ${domain.id}`)
      const evidenceQuote = requiredString(proposal.evidenceQuote, 'proposal evidence quote')
      if (evidenceQuote.length < 20 || evidenceQuote.length > 1200 || !sourceText.includes(normalizedText(evidenceQuote))) {
        throw new Error('Proposal evidence quote is not a verbatim excerpt from the source document')
      }
      const fingerprint = `${kind}|${mechanism}|${normalizedText(assertion)}`
      if (seen.has(fingerprint)) throw new Error('Observation triage returned duplicate proposals')
      seen.add(fingerprint)
      return {
        assertion, kind, mechanism, evidenceQuote,
        confidence: integerScore(proposal.confidence, 'proposal confidence'), materiality: integerScore(proposal.materiality, 'proposal materiality'), novelty: integerScore(proposal.novelty, 'proposal novelty'),
      }
    }),
  }
}

interface CapturedDocumentContext {
  captureId: string
  documentId: string
  sourceId: string
  sourceSlug: string
  sourceLabel: string
  publisher: string
  canonicalUrl: string
  domainId: string
  extractedKey: string
}

async function loadCapturedDocumentContexts(captureIds?: string[]): Promise<CapturedDocumentContext[]> {
  const supabase = getSupabaseClient()
  if (!supabase) throw new Error('Supabase service credentials are not configured')
  let query = supabase.from('world_source_document_captures')
    .select('id,source_id,document_id,domain_ids,world_source_registry(slug,label,publisher,canonical_url),world_documents(id,extracted_key,extraction_status)')
    .eq('status', 'captured').not('document_id', 'is', null).order('captured_at', { ascending: true }).limit(20)
  if (captureIds && captureIds.length > 0) query = query.in('id', captureIds.slice(0, 20))
  const { data: captures, error } = await query
  if (error) throw new Error(`Unable to load captured source documents: ${error.message}`)
  const contexts: CapturedDocumentContext[] = []
  for (const row of captures ?? []) {
    const source = record(row.world_source_registry)
    const document = record(row.world_documents)
    const domains = Array.isArray(row.domain_ids) ? row.domain_ids.filter((item): item is string => typeof item === 'string') : []
    const domainId = domains.find((id) => getMarketDomainPack(id))
    if (!source.slug || !document.id || !domainId || document.extraction_status !== 'complete' || typeof document.extracted_key !== 'string') continue
    const { count, error: proposalError } = await supabase.from('world_observation_proposals').select('id', { count: 'exact', head: true }).eq('source_capture_id', row.id)
    if (proposalError) throw new Error(`Unable to inspect existing observation proposals: ${proposalError.message}`)
    if ((count ?? 0) > 0) continue
    contexts.push({
      captureId: String(row.id), documentId: String(document.id), sourceId: String(row.source_id), sourceSlug: String(source.slug), sourceLabel: String(source.label),
      publisher: String(source.publisher), canonicalUrl: String(source.canonical_url), domainId, extractedKey: document.extracted_key,
    })
  }
  return contexts
}

function proposalPrompt(context: CapturedDocumentContext, excerpt: string, allowedKinds: string[]): string {
  const domain = getMarketDomainPack(context.domainId)!
  return [
    'You are Stratum\'s low-cost observation triage worker. Extract only 1-6 narrow, source-grounded candidate observations from the supplied immutable document excerpt.',
    'This output is a reviewable proposal, not accepted evidence. Do not create a thesis, recommendation, price target, prediction, causal conclusion, or any claim not directly supported by a verbatim quote below. Omit anything uncertain.',
    `DOCUMENT ID: ${context.documentId}`,
    `SOURCE: ${context.publisher} — ${context.canonicalUrl}`,
    `DOMAIN: ${domain.id}`,
    `PERMITTED MECHANISMS: ${domain.mechanisms.map((item) => item.id).join(', ')}`,
    `PERMITTED OBSERVATION KINDS: ${allowedKinds.join(', ')}`,
    'Every evidenceQuote must be a direct, contiguous excerpt from SOURCE EXCERPT. Assertions must be modest restatements of that quote.',
    `SOURCE EXCERPT:\n${excerpt}`,
  ].join('\n\n')
}

function proposalFingerprint(context: CapturedDocumentContext, proposal: WorldObservationProposalContent['proposals'][number]): string {
  return createHash('sha256').update(JSON.stringify({ documentId: context.documentId, domainId: context.domainId, kind: proposal.kind, mechanism: proposal.mechanism, assertion: normalizedText(proposal.assertion), quote: normalizedText(proposal.evidenceQuote) })).digest('hex')
}

export interface TriageWorldObservationProposalsOptions {
  captureIds?: string[]
  runner?: (prompt: string) => Promise<CodexExecResult<WorldObservationProposalContent>>
}

async function recordTriageRun(input: {
  captureId: string
  status: 'succeeded' | 'failed' | 'skipped'
  proposalCount?: number
  provider?: string | null
  model?: string | null
  error?: string | null
}): Promise<void> {
  const supabase = getSupabaseClient()
  if (!supabase) throw new Error('Supabase service credentials are not configured')
  const { error } = await supabase.from('world_observation_proposal_triage_runs').insert({
    source_capture_id: input.captureId, status: input.status, proposal_count: input.proposalCount ?? 0,
    provider: input.provider ?? null, model: input.model ?? null, error: input.error ?? null,
  })
  if (error) throw new Error(`Unable to persist observation triage telemetry: ${error.message}`)
}

/** Cheap, bounded proposal extraction. It never writes world_observations and
 * the rest of the market model never reads this proposal table directly. */
export async function triageCapturedWorldObservationProposals(options: TriageWorldObservationProposalsOptions = {}): Promise<{
  documents: number
  proposals: number
  captureIds: string[]
  failures: Array<{ captureId: string; sourceSlug: string; error: string }>
}> {
  const supabase = getSupabaseClient()
  if (!supabase) throw new Error('Supabase service credentials are not configured')
  const contexts = await loadCapturedDocumentContexts(options.captureIds)
  let proposalCount = 0
  const completedCaptureIds: string[] = []
  const failures: Array<{ captureId: string; sourceSlug: string; error: string }> = []
  for (const context of contexts) {
    try {
      const { contract } = await resolveApprovedWorldSource(context.sourceSlug, context.canonicalUrl)
      const excerpt = await readWorldCorpusExtract(context.extractedKey, 12_000)
      if (excerpt.trim().length < 240) {
        await recordTriageRun({ captureId: context.captureId, status: 'skipped', error: 'Extracted source text is too short for bounded triage' })
        continue
      }
      const runner = options.runner ?? ((prompt: string) => runCodexJson({
        prompt, schemaPath: 'schemas/world-observation-proposals.schema.json', model: selectMarketModel('observation_triage').model,
        validate: (value) => validateWorldObservationProposals(value, { domainId: context.domainId, contract, extractedText: excerpt }), timeoutMs: 8 * 60 * 1_000,
      }))
      const result = await runner(proposalPrompt(context, excerpt, contract.assertionsAllowed))
      const content = validateWorldObservationProposals(result.data, { domainId: context.domainId, contract, extractedText: excerpt })
      const generatedAt = new Date().toISOString()
      const rows = content.proposals.map((proposal) => ({
        source_capture_id: context.captureId, document_id: context.documentId, source_id: context.sourceId, domain_id: context.domainId,
        mechanism: proposal.mechanism, assertion: proposal.assertion, observation_kind: proposal.kind, evidence_quote: proposal.evidenceQuote,
        confidence: proposal.confidence, materiality: proposal.materiality, novelty: proposal.novelty, fingerprint: proposalFingerprint(context, proposal),
        provider: result.metadata.provider, model: result.metadata.model, generated_at: generatedAt,
        metadata: { proposalOnly: true, sourceContractVersion: contract.version },
      }))
      const { error } = await supabase.from('world_observation_proposals').upsert(rows, { onConflict: 'fingerprint', ignoreDuplicates: true })
      if (error) throw new Error(`Unable to persist observation proposals: ${error.message}`)
      await recordTriageRun({ captureId: context.captureId, status: 'succeeded', proposalCount: rows.length, provider: result.metadata.provider, model: result.metadata.model })
      proposalCount += rows.length
      completedCaptureIds.push(context.captureId)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      await recordTriageRun({ captureId: context.captureId, status: 'failed', error: message })
      failures.push({ captureId: context.captureId, sourceSlug: context.sourceSlug, error: message })
    }
  }
  return { documents: contexts.length, proposals: proposalCount, captureIds: completedCaptureIds, failures }
}

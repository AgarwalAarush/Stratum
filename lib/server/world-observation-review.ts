import { createHash } from 'node:crypto'
import { getMarketDomainPack } from '../markets/domain-packs.ts'
import { resolveApprovedWorldSourceContractVersion } from './world-source-control.ts'
import { getSupabaseClient } from './supabase.ts'
import { readWorldCorpusExtract } from './world-corpus.ts'

type RecordValue = Record<string, unknown>
function record(value: unknown): RecordValue { return value && typeof value === 'object' && !Array.isArray(value) ? value as RecordValue : {} }
function required(value: string, label: string): string { if (!value.trim()) throw new Error(`Missing ${label}`); return value.trim() }
function validUserId(value: string): boolean { return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value) }
function normalizedText(value: string): string { return value.toLocaleLowerCase().replace(/\s+/g, ' ').trim() }

/** Fixed Markets user used for policy auto-accept reviews. Seeded by migration. */
export const POLICY_AUTO_REVIEWER_ID = '00000000-0000-4000-8000-0000000000aa'
export const POLICY_AUTO_RATIONALE = 'auto-accept: quote-bound approved-source v1'

export async function reviewWorldObservationProposal(input: {
  proposalId: string
  reviewerId: string
  decision: 'accepted' | 'rejected'
  rationale: string
  reviewerKind?: 'human' | 'policy_auto'
}): Promise<{ decision: 'accepted' | 'rejected'; observationId: string | null }> {
  if (!validUserId(input.reviewerId)) throw new Error('A persisted authenticated reviewer is required')
  const rationale = required(input.rationale, 'review rationale')
  if (rationale.length > 1_000) throw new Error('Review rationale exceeds limit')
  const reviewerKind = input.reviewerKind ?? 'human'
  if (reviewerKind === 'policy_auto' && input.reviewerId !== POLICY_AUTO_REVIEWER_ID) {
    throw new Error('Policy auto-accept must use the dedicated policy reviewer identity')
  }
  const supabase = getSupabaseClient()
  if (!supabase) throw new Error('Supabase service credentials are not configured')
  const { data: row, error } = await supabase.from('world_observation_proposals')
    .select('*,world_source_registry(slug,canonical_url,status),world_documents(id,content_hash,extracted_key,extraction_status),world_source_document_captures(contract_version,canonical_url,mime_type)')
    .eq('id', input.proposalId).maybeSingle()
  if (error || !row) throw new Error(`Observation proposal was not found: ${error?.message ?? 'unknown error'}`)
  const proposal = record(row)
  const { data: existing } = await supabase.from('world_observation_proposal_reviews').select('decision,observation_id').eq('proposal_id', input.proposalId).maybeSingle()
  if (existing) throw new Error(`Observation proposal has already been ${String(existing.decision)}`)
  if (input.decision === 'rejected') {
    const { error: reviewError } = await supabase.from('world_observation_proposal_reviews').insert({
      proposal_id: input.proposalId, reviewer_id: input.reviewerId, decision: 'rejected', rationale, reviewer_kind: reviewerKind,
    })
    if (reviewError) throw new Error(`Unable to reject observation proposal: ${reviewError.message}`)
    return { decision: 'rejected', observationId: null }
  }
  await assertProposalEligibleForAcceptance(row)
  const source = record(row.world_source_registry)
  const document = record(row.world_documents)
  const capture = record(row.world_source_document_captures)
  const domainId = String(proposal.domain_id)
  const mechanism = String(proposal.mechanism)
  const kind = String(proposal.observation_kind)
  const { contract } = await resolveApprovedWorldSourceContractVersion(
    String(source.slug), String(capture.canonical_url), Number(capture.contract_version),
    typeof capture.mime_type === 'string' ? capture.mime_type : undefined,
  )
  if (!contract.assertionsAllowed.includes(kind)) throw new Error(`Current source contract does not permit ${kind} observations`)
  const fingerprint = createHash('sha256').update(JSON.stringify({ proposalId: input.proposalId, documentId: document.id, assertion: proposal.assertion, mechanism, kind })).digest('hex')
  const { data: observationId, error: acceptanceError } = await supabase.rpc('accept_world_observation_proposal', {
    p_proposal_id: input.proposalId,
    p_reviewer_id: input.reviewerId,
    p_rationale: rationale,
    p_fingerprint: fingerprint,
    p_metadata: {
      sourceContractVersion: contract.version,
      sourceCaptureId: proposal.source_capture_id,
      reviewerKind,
    },
  })
  if (acceptanceError || typeof observationId !== 'string') {
    throw new Error(`Unable to accept observation proposal: ${acceptanceError?.message ?? 'unknown error'}`)
  }
  return { decision: 'accepted', observationId }
}

async function assertProposalEligibleForAcceptance(row: RecordValue): Promise<void> {
  const proposal = record(row)
  const source = record(row.world_source_registry)
  const document = record(row.world_documents)
  const status = String(source.status ?? '')
  if (status !== 'approved' && status !== 'probation') {
    throw new Error('Only approved or probation sources may auto-accept observation proposals')
  }
  const domainId = String(proposal.domain_id)
  const mechanism = String(proposal.mechanism)
  const domain = getMarketDomainPack(domainId)
  if (!domain?.mechanisms.some((item) => item.id === mechanism)) {
    throw new Error('Proposal mechanism is no longer valid for its domain')
  }
  const evidenceQuote = String(proposal.evidence_quote ?? '').trim()
  if (evidenceQuote.length < 20) throw new Error('Proposal evidence quote is missing or too short')
  const extractedKey = typeof document.extracted_key === 'string' ? document.extracted_key : ''
  if (!extractedKey || document.extraction_status !== 'complete') {
    throw new Error('Proposal document extract is unavailable for quote verification')
  }
  const extractedText = await readWorldCorpusExtract(extractedKey)
  if (!normalizedText(extractedText).includes(normalizedText(evidenceQuote))) {
    throw new Error('Proposal evidence quote is not a verbatim excerpt from the source document')
  }
}

export type AutoAcceptResult = {
  examined: number
  accepted: number
  skipped: number
  failed: number
  observationIds: string[]
  remainingByDomain: Record<string, number>
  errors: Array<{ proposalId: string; error: string }>
}

/**
 * Policy auto-accept replaces the human click, not the evidence gate. A quote
 * must still be verbatim from an approved/probation capture under a live contract.
 */
export async function autoAcceptEligibleWorldObservationProposals(options: {
  domainId?: string
  limit?: number
} = {}): Promise<AutoAcceptResult> {
  const supabase = getSupabaseClient()
  if (!supabase) throw new Error('Supabase service credentials are not configured')
  const limit = Math.max(1, Math.min(80, Math.floor(options.limit ?? 40)))
  let query = supabase.from('world_observation_proposals')
    .select('id,domain_id,world_observation_proposal_reviews(decision),world_source_registry!inner(status)')
    .order('generated_at', { ascending: true })
    .limit(limit * 3)
  if (options.domainId) query = query.eq('domain_id', options.domainId)
  const { data, error } = await query
  if (error) throw new Error(`Unable to load observation proposals for auto-accept: ${error.message}`)

  const pending = (data ?? []).filter((row) => {
    const review = record(row.world_observation_proposal_reviews)
    const source = record(row.world_source_registry)
    const status = String(source.status ?? '')
    return !review.decision && (status === 'approved' || status === 'probation')
  }).slice(0, limit)

  const result: AutoAcceptResult = {
    examined: pending.length, accepted: 0, skipped: 0, failed: 0, observationIds: [], remainingByDomain: {}, errors: [],
  }

  for (const row of pending) {
    const proposalId = String(row.id)
    try {
      const accepted = await reviewWorldObservationProposal({
        proposalId,
        reviewerId: POLICY_AUTO_REVIEWER_ID,
        decision: 'accepted',
        rationale: POLICY_AUTO_RATIONALE,
        reviewerKind: 'policy_auto',
      })
      if (accepted.observationId) {
        result.accepted += 1
        result.observationIds.push(accepted.observationId)
      } else {
        result.skipped += 1
      }
    } catch (cause) {
      result.failed += 1
      result.errors.push({ proposalId, error: cause instanceof Error ? cause.message : String(cause) })
    }
  }

  const { data: leftover, error: leftoverError } = await supabase.from('world_observation_proposals')
    .select('domain_id,world_observation_proposal_reviews(decision)')
  if (leftoverError) throw new Error(`Unable to count remaining proposals: ${leftoverError.message}`)
  for (const row of leftover ?? []) {
    const review = record(row.world_observation_proposal_reviews)
    if (review.decision) continue
    const domainId = String(row.domain_id)
    result.remainingByDomain[domainId] = (result.remainingByDomain[domainId] ?? 0) + 1
  }
  return result
}

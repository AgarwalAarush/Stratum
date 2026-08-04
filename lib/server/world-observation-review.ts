import { createHash } from 'node:crypto'
import { getMarketDomainPack } from '../markets/domain-packs.ts'
import { resolveApprovedWorldSourceContractVersion } from './world-source-control.ts'
import { getSupabaseClient } from './supabase.ts'

type RecordValue = Record<string, unknown>
function record(value: unknown): RecordValue { return value && typeof value === 'object' && !Array.isArray(value) ? value as RecordValue : {} }
function required(value: string, label: string): string { if (!value.trim()) throw new Error(`Missing ${label}`); return value.trim() }
function validUserId(value: string): boolean { return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value) }

export async function reviewWorldObservationProposal(input: { proposalId: string; reviewerId: string; decision: 'accepted' | 'rejected'; rationale: string }): Promise<{ decision: 'accepted' | 'rejected'; observationId: string | null }> {
  if (!validUserId(input.reviewerId)) throw new Error('A persisted authenticated reviewer is required')
  const rationale = required(input.rationale, 'review rationale')
  if (rationale.length > 1_000) throw new Error('Review rationale exceeds limit')
  const supabase = getSupabaseClient()
  if (!supabase) throw new Error('Supabase service credentials are not configured')
  const { data: row, error } = await supabase.from('world_observation_proposals')
    .select('*,world_source_registry(slug,canonical_url),world_documents(id,content_hash),world_source_document_captures(contract_version,canonical_url,mime_type)').eq('id', input.proposalId).maybeSingle()
  if (error || !row) throw new Error(`Observation proposal was not found: ${error?.message ?? 'unknown error'}`)
  const proposal = record(row)
  const { data: existing } = await supabase.from('world_observation_proposal_reviews').select('decision,observation_id').eq('proposal_id', input.proposalId).maybeSingle()
  if (existing) throw new Error(`Observation proposal has already been ${String(existing.decision)}`)
  if (input.decision === 'rejected') {
    const { error: reviewError } = await supabase.from('world_observation_proposal_reviews').insert({ proposal_id: input.proposalId, reviewer_id: input.reviewerId, decision: 'rejected', rationale })
    if (reviewError) throw new Error(`Unable to reject observation proposal: ${reviewError.message}`)
    return { decision: 'rejected', observationId: null }
  }
  const source = record(row.world_source_registry)
  const document = record(row.world_documents)
  const capture = record(row.world_source_document_captures)
  const domainId = String(proposal.domain_id)
  const mechanism = String(proposal.mechanism)
  const kind = String(proposal.observation_kind)
  const domain = getMarketDomainPack(domainId)
  if (!domain?.mechanisms.some((item) => item.id === mechanism)) throw new Error('Proposal mechanism is no longer valid for its domain')
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
    p_metadata: { sourceContractVersion: contract.version, sourceCaptureId: proposal.source_capture_id },
  })
  if (acceptanceError || typeof observationId !== 'string') {
    throw new Error(`Unable to accept observation proposal: ${acceptanceError?.message ?? 'unknown error'}`)
  }
  return { decision: 'accepted', observationId }
}

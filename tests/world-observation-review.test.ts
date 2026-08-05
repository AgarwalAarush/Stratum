import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

test('proposal review preserves evidence gates before any accepted observation', async () => {
  const [review, route, migration, acceptanceMigration, evidenceReceivedMigration, autoMigration] = await Promise.all([
    readFile(new URL('../lib/server/world-observation-review.ts', import.meta.url), 'utf8'),
    readFile(new URL('../app/api/markets/world-sources/route.ts', import.meta.url), 'utf8'),
    readFile(new URL('../supabase/migrations/202608040010_world_observation_proposal_reviews.sql', import.meta.url), 'utf8'),
    readFile(new URL('../supabase/migrations/202608040011_accept_world_observation_proposal.sql', import.meta.url), 'utf8'),
    readFile(new URL('../supabase/migrations/202608040022_research_frontier_evidence_received.sql', import.meta.url), 'utf8'),
    readFile(new URL('../supabase/migrations/202608040025_orchestration_brain_v2.sql', import.meta.url), 'utf8'),
  ])
  assert.match(review, /A persisted authenticated reviewer is required/)
  assert.match(review, /input\.decision === 'rejected'/)
  assert.match(review, /autoAcceptEligibleWorldObservationProposals/)
  assert.match(review, /policy_auto/)
  assert.match(review, /approved or probation/)
  assert.match(review, /verbatim excerpt/)
  // Accept must match the world_documents status enum and triage gate.
  assert.match(review, /extraction_status !== 'complete'/)
  assert.doesNotMatch(review, /extraction_status !== 'extracted'/)
  assert.match(acceptanceMigration, /acceptedFromProposalId/)
  assert.match(review, /resolveApprovedWorldSourceContractVersion/)
  assert.match(review, /world_source_document_captures\(contract_version,canonical_url,mime_type\)/)
  assert.match(review, /sourceCaptureId/)
  assert.match(review, /accept_world_observation_proposal/)
  assert.match(route, /review-observation-proposal/)
  assert.match(route, /auto-accept-observation-proposals/)
  assert.match(route, /enqueueAgentJob\('auto-accept-observation-proposals'/)
  assert.doesNotMatch(route, /autoAcceptEligibleWorldObservationProposals\(/)
  assert.match(route, /accepted observation:\$\{review\.observationId\}/)
  assert.match(route, /synthesize-market-hypotheses/)
  assert.match(migration, /decision in \('accepted', 'rejected'\)/)
  assert.match(migration, /decision = 'accepted' and observation_id is not null/)
  assert.match(evidenceReceivedMigration, /status = 'evidence_received'/)
  assert.match(evidenceReceivedMigration, /world_source_discovery_runs/)
  assert.match(evidenceReceivedMigration, /accepted-observation:/)
  assert.match(autoMigration, /reviewer_kind/)
  assert.match(autoMigration, /policy_auto/)
  assert.match(autoMigration, /reviewerKind/)
})

test('acceptance commits the observation and audit record as one database operation', async () => {
  const migration = await readFile(new URL('../supabase/migrations/202608040025_orchestration_brain_v2.sql', import.meta.url), 'utf8')
  assert.match(migration, /for update/)
  assert.match(migration, /insert into public\.world_observations/)
  assert.match(migration, /insert into public\.world_observation_proposal_reviews/)
  assert.match(migration, /reviewer_kind/)
  assert.match(migration, /grant execute on function public\.accept_world_observation_proposal[\s\S]*to service_role/)
})

test('worker auto-accept job re-checks quotes on the private corpus host', async () => {
  const [jobs, panel, proposals] = await Promise.all([
    readFile(new URL('../lib/server/agent-jobs.ts', import.meta.url), 'utf8'),
    readFile(new URL('../components/markets/WorldSourceControlPanel.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../lib/server/world-observation-proposals.ts', import.meta.url), 'utf8'),
  ])
  assert.match(jobs, /'auto-accept-observation-proposals'/)
  assert.match(jobs, /autoAcceptEligibleWorldObservationProposals/)
  assert.match(jobs, /re-checking quote-bound proposals against worker corpus extracts/)
  assert.match(panel, /Proposal auto-accept queued on the worker/)
  assert.match(proposals, /extraction_status !== 'complete'/)
})

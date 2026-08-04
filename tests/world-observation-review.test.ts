import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

test('proposal review preserves a human gate before any accepted observation', async () => {
  const [review, route, migration, acceptanceMigration] = await Promise.all([
    readFile(new URL('../lib/server/world-observation-review.ts', import.meta.url), 'utf8'),
    readFile(new URL('../app/api/markets/world-sources/route.ts', import.meta.url), 'utf8'),
    readFile(new URL('../supabase/migrations/202608040010_world_observation_proposal_reviews.sql', import.meta.url), 'utf8'),
    readFile(new URL('../supabase/migrations/202608040011_accept_world_observation_proposal.sql', import.meta.url), 'utf8'),
  ])
  assert.match(review, /A persisted authenticated reviewer is required/)
  assert.match(review, /input\.decision === 'rejected'/)
  assert.match(acceptanceMigration, /acceptedFromProposalId/)
  assert.match(review, /resolveApprovedWorldSourceContractVersion/)
  assert.match(review, /world_source_document_captures\(contract_version,canonical_url,mime_type\)/)
  assert.match(review, /sourceCaptureId/)
  assert.match(review, /accept_world_observation_proposal/)
  assert.match(route, /review-observation-proposal/)
  assert.match(migration, /decision in \('accepted', 'rejected'\)/)
  assert.match(migration, /decision = 'accepted' and observation_id is not null/)
})

test('acceptance commits the observation and audit record as one database operation', async () => {
  const migration = await readFile(new URL('../supabase/migrations/202608040011_accept_world_observation_proposal.sql', import.meta.url), 'utf8')
  assert.match(migration, /for update/)
  assert.match(migration, /insert into public\.world_observations/)
  assert.match(migration, /insert into public\.world_observation_proposal_reviews/)
  assert.match(migration, /grant execute on function public\.accept_world_observation_proposal[\s\S]*to service_role/)
})

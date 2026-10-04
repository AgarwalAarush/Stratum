import test, { type TestContext } from 'node:test'
import assert from 'node:assert/strict'
import { execFile as execFileCallback } from 'node:child_process'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { renderWorldNode } from '../lib/server/world-repository.ts'
import { projectWorldRepository, projectAcceptedWorldState, reconcileWorldRepositoryProjection } from '../lib/server/world-projection.ts'
import { canonicalCausalVersions } from '../lib/markets/evidence-authority.ts'
import { fetchCausalModelSnapshot } from '../lib/server/causal-model.ts'
import { resolveAgentJobHandler, type AgentJobRecord } from '../lib/server/agent-jobs.ts'
import type { WorldNode } from '../lib/markets/world-thinker-types.ts'

const execFile = promisify(execFileCallback)
type Row = Record<string, unknown>
const node: WorldNode = {
  id: 'grid-capacity', kind: 'theme', title: 'Grid capacity', status: 'active',
  asOf: '2026-10-01T12:00:00Z', nextReviewAt: '2026-10-04T12:00:00Z',
  confidence: 60, importance: 60, aliases: [], relationships: [], sourceIds: ['official:1'],
  summary: 'Reported grid investment remains an investigation input.',
  claims: [{ text: 'The agency reported grid investment.', sourceIds: ['official:1'] }],
  indicators: [], body: 'Investment implications require independent company evidence.',
}

async function fixture(t: TestContext) {
  process.env.SUPABASE_URL = 'https://world-projection-test.supabase.co'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role'
  const root = await mkdtemp(join(tmpdir(), 'world-canonical-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  await execFile('git', ['init', '--initial-branch=main', root])
  await execFile('git', ['-C', root, 'config', 'user.name', 'World test'])
  await execFile('git', ['-C', root, 'config', 'user.email', 'world-test@example.com'])
  await mkdir(join(root, 'world/themes'), { recursive: true })
  await mkdir(join(root, 'world/index'), { recursive: true })
  await writeFile(join(root, 'world/index/sources.json'), JSON.stringify([
    { id: 'official:1', url: 'https://agency.example/grid', title: 'Grid investment', claimState: 'reported', stance: 'supporting' },
  ]))
  const save = async (value: WorldNode) => {
    await writeFile(join(root, 'world/themes/grid.md'), renderWorldNode(value))
    await execFile('git', ['-C', root, 'add', 'world'])
    await execFile('git', ['-C', root, 'commit', '-m', `test: ${value.status}`])
    return (await execFile('git', ['-C', root, 'rev-parse', 'HEAD'])).stdout.trim()
  }
  const commit = await save(node)
  const projections = new Map<string, Row>()
  const models: Row[] = []
  const calls: Array<{ path: string; body: unknown }> = []
  let modelSequence = 0
  let failPromotion = false
  let failCausal = false
  t.mock.method(globalThis, 'fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input)), path = url.pathname
    const body = init?.body ? JSON.parse(String(init.body)) : undefined
    calls.push({ path, body })
    let response: unknown = []
    if (path.endsWith('/world_repository_projections')) {
      if (init?.method === 'POST') { projections.set(body.commit_sha, { ...body }); response = body }
      else if (url.searchParams.get('is_canonical') === 'eq.true') response = [...projections.values()].find(p => p.is_canonical) ?? null
      else response = projections.get(url.searchParams.get('commit_sha')?.slice(3) ?? '') ?? null
    } else if (path.endsWith('/promote_world_repository_projection_if_current')) {
      if (failPromotion) return new Response(JSON.stringify({ message: 'Promotion unavailable', code: 'P0001' }), { status: 400 })
      const current = [...projections.values()].find(p => p.is_canonical)?.commit_sha ?? null
      if (current !== body.p_commit_sha && current !== body.p_expected_current_commit_sha) return new Response(JSON.stringify({ message: 'Canonical World changed before promotion', code: '40001' }), { status: 400 })
      for (const projection of projections.values()) projection.is_canonical = projection.commit_sha === body.p_commit_sha
      response = projections.get(body.p_commit_sha)
    } else if (path.endsWith('/causal_model_versions')) {
      if (init?.method === 'POST') {
        if (failCausal) return new Response(JSON.stringify({ message: 'Causal write interrupted', code: 'P0001' }), { status: 400 })
        response = body.map((row: Row) => {
          const prior = models.find(m => m.source_id === row.source_id && m.source_version === row.source_version)
          if (prior) Object.assign(prior, row)
          else models.push({ ...row, id: `model-${++modelSequence}`, created_at: new Date(Date.UTC(2026, 9, 1, 0, 0, modelSequence)).toISOString() })
          return models.find(m => m.source_id === row.source_id && m.source_version === row.source_version)
        })
      } else {
        response = [...models].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
        const state = url.searchParams.get('state')
        if (state) response = (response as Row[]).filter(row => state.includes(String(row.state)))
      }
    } else if (path.endsWith('/claim_company_world_receipt')) {
      response = [{ report_id: 'report', owner_id: 'owner', symbol: 'ABC', status: 'reviewing', result_commit: commit }]
    }
    return new Response(JSON.stringify(response), { headers: { 'Content-Type': 'application/json' } })
  })
  return { root, commit, save, projections, models, calls, failPromotion: () => { failPromotion = true }, failCausal: () => { failCausal = true } }
}

test('promoting an existing accepted shadow commit updates repository and causal authority without duplicating versions', async t => {
  const f = await fixture(t)
  await reconcileWorldRepositoryProjection({ root: f.root, branch: 'main', commit: f.commit, canonical: false })
  assert.equal(f.projections.get(f.commit)?.is_canonical, false)
  assert.deepEqual(canonicalCausalVersions(f.models, true, '2026-10-03T12:00:00Z'), [])
  const promoted = await reconcileWorldRepositoryProjection({ root: f.root, branch: 'main', commit: f.commit, canonical: true })
  assert.equal(promoted.idempotent, true)
  assert.equal(promoted.canonical, true)
  assert.equal(f.projections.get(f.commit)?.is_canonical, true)
  assert.equal(canonicalCausalVersions(f.models, true, '2026-10-03T12:00:00Z').length, 1)
  await reconcileWorldRepositoryProjection({ root: f.root, branch: 'main', commit: f.commit, canonical: true })
  assert.equal(f.models.length, 1)
  assert.equal(f.projections.size, 1)
  const promotions = f.calls.filter(c => c.path.endsWith('/promote_world_repository_projection_if_current'))
  assert.equal(promotions.length, 2)
  assert.deepEqual(promotions[0].body, { p_commit_sha: f.commit, p_expected_current_commit_sha: null })
  assert.deepEqual(promotions[1].body, { p_commit_sha: f.commit, p_expected_current_commit_sha: f.commit })
  assert.equal(f.calls.some(c => c.path.endsWith('/promote_world_repository_projection')), false)
})

test('failed promotion rejects recovery and leaves the existing commit shadow', async t => {
  const f = await fixture(t)
  await reconcileWorldRepositoryProjection({ root: f.root, commit: f.commit, canonical: false })
  const memoryPublications = f.calls.filter(c => c.path.endsWith('/publish_world_memory_snapshot')).length
  f.failPromotion()
  await assert.rejects(reconcileWorldRepositoryProjection({ root: f.root, commit: f.commit, canonical: true }), /Promotion unavailable/)
  assert.equal(f.projections.get(f.commit)?.is_canonical, false)
  assert.deepEqual(canonicalCausalVersions(f.models, true, '2026-10-03T12:00:00Z'), [])
  assert.equal(f.calls.filter(c => c.path.endsWith('/publish_world_memory_snapshot')).length, memoryPublications)
})

test('direct accepted-state publication skips superseded causal and coverage writes', async t => {
  const f = await fixture(t)
  await projectAcceptedWorldState({ root: f.root, commit: f.commit, canonical: true })
  const newer = await f.save({ ...node, summary: 'New independent evidence updated the accepted model.', asOf: '2026-10-02T12:00:00Z' })
  await projectAcceptedWorldState({ root: f.root, commit: newer, canonical: true })
  const modelCount = f.models.length
  const coverageWrites = f.calls.filter(c => c.path.endsWith('/world_coverage_frontiers') && c.body !== undefined).length
  const recovered = await projectAcceptedWorldState({ root: f.root, commit: f.commit, canonical: true })
  assert.equal(recovered.projection.superseded, true)
  assert.equal(recovered.projection.canonical, false)
  assert.deepEqual(recovered.causalProjection, { modelCount: 0, reviewCount: 0 })
  assert.equal(f.models.length, modelCount)
  assert.equal(f.calls.filter(c => c.path.endsWith('/world_coverage_frontiers') && c.body !== undefined).length, coverageWrites)
  assert.equal(f.projections.get(newer)?.is_canonical, true)
})

test('a promoted pointer with interrupted causal materialization cannot consume the previous commit', async t => {
  const f = await fixture(t)
  await projectAcceptedWorldState({ root: f.root, commit: f.commit, canonical: true })
  const newer = await f.save({ ...node, summary: 'New accepted evidence requires a new materialized version.', asOf: '2026-10-02T12:00:00Z' })
  f.failCausal()
  await assert.rejects(projectAcceptedWorldState({ root: f.root, commit: newer, canonical: true }), /Causal write interrupted/)
  assert.equal(f.projections.get(newer)?.is_canonical, true)
  assert.equal(f.models.length, 1)
  assert.equal(canonicalCausalVersions(f.models, true, '2026-10-03T12:00:00Z').length, 1)
  assert.deepEqual(canonicalCausalVersions(f.models, true, '2026-10-03T12:00:00Z', newer), [])
})

test('withdrawn canonical nodes suppress older authority and recovery cannot roll back a newer accepted commit', async t => {
  const f = await fixture(t)
  await reconcileWorldRepositoryProjection({ root: f.root, commit: f.commit, canonical: true })
  const terminal = await f.save({ ...node, status: 'archived', asOf: '2026-10-02T12:00:00Z' })
  await reconcileWorldRepositoryProjection({ root: f.root, commit: terminal, canonical: true })
  assert.equal(f.models.at(-1)?.state, 'archived')
  assert.deepEqual(canonicalCausalVersions(f.models, true, '2026-10-03T12:00:00Z'), [])
  assert.deepEqual((await fetchCausalModelSnapshot('owner')).world, [])
  const modelCount = f.models.length
  const memoryPublications = f.calls.filter(c => c.path.endsWith('/publish_world_memory_snapshot')).length
  const recovered = await reconcileWorldRepositoryProjection({ root: f.root, commit: f.commit, canonical: true })
  assert.equal(recovered.superseded, true)
  assert.equal(f.projections.get(terminal)?.is_canonical, true)
  assert.equal(f.projections.get(f.commit)?.is_canonical, false)
  assert.equal(f.models.length, modelCount)
  assert.equal(f.calls.filter(c => c.path.endsWith('/publish_world_memory_snapshot')).length, memoryPublications)
  assert.deepEqual(canonicalCausalVersions(f.models, true, '2026-10-03T12:00:00Z'), [])
})

test('company feedback recovery follows the configured World authority without another model review', async t => {
  const priorFlag = process.env.STRATUM_WORLD_CUTOVER_ENABLED
  const priorRoot = process.env.STRATUM_WORLD_ROOT
  t.after(() => {
    if (priorFlag === undefined) delete process.env.STRATUM_WORLD_CUTOVER_ENABLED
    else process.env.STRATUM_WORLD_CUTOVER_ENABLED = priorFlag
    if (priorRoot === undefined) delete process.env.STRATUM_WORLD_ROOT
    else process.env.STRATUM_WORLD_ROOT = priorRoot
  })
  for (const enabled of [false, true]) {
    const f = await fixture(t)
    process.env.STRATUM_WORLD_CUTOVER_ENABLED = String(enabled)
    process.env.STRATUM_WORLD_ROOT = f.root
    await projectWorldRepository({ root: f.root, commit: f.commit, canonical: false })
    const handler = resolveAgentJobHandler('run-world-thinker')
    const result = await handler({ id: 'job', job_type: 'run-world-thinker', payload: { trigger: 'company_research', researchNoteId: 'report' } } as AgentJobRecord, async () => {}) as { status: string }
    assert.equal(result.status, 'applied')
    assert.equal(f.projections.get(f.commit)?.is_canonical, enabled)
    assert.equal(canonicalCausalVersions(f.models, true, '2026-10-03T12:00:00Z').length, enabled ? 1 : 0)
    t.mock.restoreAll()
  }
})

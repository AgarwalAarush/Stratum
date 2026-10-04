import test, { type TestContext } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { WorldSourceContract, WorldSourceRegistryEntry } from '../lib/markets/types.ts'
import { collectGovernedWorldSourceDocuments, fetchGovernedSourceDocument, governedCaptureCoverageKey, isSourceCollectionDue, shouldCollectGovernedSource } from '../lib/server/world-source-collector.ts'
import { fetchAdmittedWorldSources } from '../lib/server/world-source-control.ts'

const source = {
  id: 'source-id', slug: 'official-source', label: 'Official source', publisher: 'Official publisher', canonicalUrl: 'https://official.example/data',
  sourceTier: 'regulatory', sourceKind: 'html', status: 'approved', evidenceClasses: ['regulatory_data'], discoveredBy: 'seed', discoveryRunId: null,
  approvedAt: '2026-08-01T00:00:00.000Z', blockedReason: null, candidateContext: null, domainIds: ['ai-power'], health: null, createdAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:00.000Z',
} satisfies WorldSourceRegistryEntry

const contract = {
  id: 'contract-id', sourceId: 'source-id', version: 1, status: 'active', allowedHosts: ['official.example'], allowedPaths: ['/data'],
  acceptedMimeTypes: ['text/html'], cadence: 'daily', assertionsAllowed: ['fact'], retentionDays: 365, notes: 'Bounded official page.', createdAt: '2026-08-01T00:00:00.000Z',
} satisfies WorldSourceContract

test('collector follows only redirects permitted by the active source contract', async () => {
  const calls: string[] = []
  const fetched = await fetchGovernedSourceDocument({ source, contract }, {
    fetchImpl: async (input) => {
      calls.push(String(input))
      if (String(input).endsWith('/data')) return new Response(null, { status: 302, headers: { location: '/data/release' } })
      return new Response('<html><title>Release</title><main>Official content</main></html>', { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } })
    },
  })
  assert.deepEqual(calls, ['https://official.example/data', 'https://official.example/data/release'])
  assert.equal(fetched.resolvedUrl, 'https://official.example/data/release')
  assert.equal(fetched.mimeType, 'text/html')
  assert.match(fetched.body.toString('utf8'), /Official content/)
})

test('collector rejects an off-contract redirect before it is fetched', async () => {
  const calls: string[] = []
  await assert.rejects(
    fetchGovernedSourceDocument({ source, contract }, {
      fetchImpl: async (input) => {
        calls.push(String(input))
        return new Response(null, { status: 302, headers: { location: 'https://outside.example/payload' } })
      },
    }),
    /outside the active source contract/,
  )
  assert.deepEqual(calls, ['https://official.example/data'])
})

test('collector rejects MIME types outside the source contract and does not poll event sources after their initial capture', async () => {
  await assert.rejects(
    fetchGovernedSourceDocument({ source, contract }, {
      fetchImpl: async () => new Response('{"value":1}', { status: 200, headers: { 'content-type': 'application/json' } }),
    }),
    /outside the active source contract/,
  )
  assert.equal(isSourceCollectionDue('daily', new Date('2026-08-03T00:00:00Z')), true)
  assert.equal(isSourceCollectionDue('weekly', new Date('2026-08-02T00:00:00Z')), true)
  assert.equal(isSourceCollectionDue('monthly', new Date('2026-08-01T00:00:00Z')), true)
  assert.equal(isSourceCollectionDue('event', new Date('2026-08-02T00:00:00Z')), false)
})

test('a newly admitted source gets one governed capture before its normal refresh cadence', () => {
  const monday = new Date('2026-08-03T00:00:00Z')
  assert.equal(shouldCollectGovernedSource('weekly', false, monday), true)
  assert.equal(shouldCollectGovernedSource('weekly', true, monday), false)
  assert.equal(shouldCollectGovernedSource('weekly', true, new Date('2026-08-02T00:00:00Z')), true)
  assert.equal(shouldCollectGovernedSource('event', false, monday), true)
  assert.equal(shouldCollectGovernedSource('event', true, monday), false)
})

test('a corrected canonical target is treated as uncaptured under the existing contract', () => {
  const previous = governedCaptureCoverageKey('source-id', 2, 'https://official.example/old-release')
  const corrected = governedCaptureCoverageKey('source-id', 2, 'https://official.example/new-release')
  assert.notEqual(previous, corrected)
  assert.equal(shouldCollectGovernedSource('weekly', previous === corrected, new Date('2026-08-03T00:00:00Z')), true)
})

type DatabaseRow = Record<string, unknown>

function registryRow(id: string, status = 'approved', updatedAt = '2026-08-01T00:00:00Z'): DatabaseRow {
  return {
    id, slug: id, label: id, publisher: 'Official publisher', canonical_url: `https://official.example/data/${id}`,
    source_tier: 'regulatory', source_kind: 'html', status, evidence_classes: ['regulatory_data'], discovered_by: 'seed',
    discovery_run_id: null, approved_at: status === 'approved' ? updatedAt : null, blocked_reason: null, metadata: {},
    created_at: updatedAt, updated_at: updatedAt,
  }
}

function contractRow(sourceId: string, cadence = 'event'): DatabaseRow {
  return {
    id: `contract-${sourceId}`, source_id: sourceId, version: 1, status: 'active', allowed_hosts: ['official.example'],
    allowed_paths: ['/data'], accepted_mime_types: ['text/html'], cadence, assertions_allowed: ['fact'], retention_days: 365,
    notes: 'Bounded official source.', created_at: '2026-08-01T00:00:00Z',
  }
}

/** Apply the actual PostgREST filters, ordering and pagination sent by the
 * Supabase client, so an unfiltered or bounded source read fails the regression. */
async function mockSourceDatabase(context: TestContext, tables: Record<string, DatabaseRow[]>, failedSourcePage?: number) {
  const environmentKeys = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'STRATUM_DATA_ROOT', 'STRATUM_CORPUS_TEST_MODE'] as const
  const previous = Object.fromEntries(environmentKeys.map((key) => [key, process.env[key]]))
  const root = await mkdtemp(join(tmpdir(), 'stratum-admitted-sources-'))
  process.env.SUPABASE_URL = 'https://admitted-sources-test.supabase.co'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-only-key'
  process.env.STRATUM_DATA_ROOT = root
  process.env.STRATUM_CORPUS_TEST_MODE = 'true'
  context.after(async () => {
    for (const key of environmentKeys) {
      if (previous[key] === undefined) delete process.env[key]
      else process.env[key] = previous[key]
    }
    await rm(root, { recursive: true, force: true })
  })
  const requests: URL[] = []
  context.mock.method(globalThis, 'fetch', async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input))
    assert.equal(url.origin, 'https://admitted-sources-test.supabase.co')
    requests.push(url)
    const table = url.pathname.split('/').at(-1)!
    assert.ok(table in tables, `Unexpected database table: ${table}`)
    if (table === 'world_source_registry' && Number(url.searchParams.get('offset') ?? 0) === failedSourcePage) {
      return Response.json({ message: 'Source page unavailable' }, { status: 400 })
    }
    const method = init?.method ?? 'GET'
    let rows: DatabaseRow[]
    if (method === 'POST') {
      assert.ok(['world_documents', 'world_source_document_captures'].includes(table), `Unexpected write: ${table}`)
      const body = JSON.parse(String(init?.body)) as DatabaseRow
      const row = { ...body, id: `${table}-${tables[table].length + 1}` }
      tables[table].push(row)
      rows = [row]
    } else {
      assert.equal(method, 'GET')
      rows = [...tables[table]]
      for (const [column, filter] of url.searchParams) {
        if (filter.startsWith('eq.')) rows = rows.filter((row) => String(row[column]) === filter.slice(3))
        if (filter.startsWith('in.(')) {
          const values = filter.slice(4, -1).split(',').map((value) => value.replaceAll('"', ''))
          rows = rows.filter((row) => values.includes(String(row[column])))
        }
      }
      const ordering = url.searchParams.get('order')?.split(',') ?? []
      rows.sort((left, right) => {
        for (const field of ordering) {
          const [column, direction] = field.split('.')
          const compared = String(left[column]).localeCompare(String(right[column]))
          if (compared) return direction === 'desc' ? -compared : compared
        }
        return 0
      })
      const offset = Number(url.searchParams.get('offset') ?? 0)
      const limit = Number(url.searchParams.get('limit') ?? 1_000)
      rows = rows.slice(offset, offset + limit)
      if (table === 'world_source_registry' && url.searchParams.get('select')?.includes('world_source_domains')) {
        rows = rows.map((row) => ({ ...row, world_source_domains: tables.world_source_domains.filter((mapping) => mapping.source_id === row.id) }))
      }
    }
    const objectResponse = new Headers(init?.headers).get('accept')?.includes('application/vnd.pgrst.object+json')
    return Response.json(objectResponse ? rows[0] : rows)
  })
  return requests
}

function collectionTables(sources: DatabaseRow[]): Record<string, DatabaseRow[]> {
  return {
    world_source_registry: sources,
    world_source_domains: sources.map((row) => ({ source_id: row.id, domain_id: 'ai-power' })),
    world_source_contract_versions: sources.map((row) => contractRow(String(row.id))),
    market_domain_packs: [{ id: 'ai-power', status: 'active' }],
    world_source_document_captures: [], world_documents: [],
  }
}

test('collection captures older admitted sources despite more than 200 newer candidates', async (context) => {
  const candidates = Array.from({ length: 250 }, (_, index) => registryRow(`candidate-${index}`, 'candidate', '2026-10-01T00:00:00Z'))
  const sources = [registryRow('old-approved'), registryRow('old-probation', 'probation'), registryRow('inactive-source'), registryRow('blocked-source', 'blocked'), ...candidates]
  // The old dashboard query would contain only candidates from this fixture.
  assert.ok([...sources].sort((left, right) => String(right.updated_at).localeCompare(String(left.updated_at))).slice(0, 200).every((row) => row.status === 'candidate'))
  const tables = collectionTables(sources)
  tables.world_source_domains.find((mapping) => mapping.source_id === 'inactive-source')!.domain_id = 'critical-materials'
  tables.market_domain_packs.push({ id: 'critical-materials', status: 'archived' })
  await mockSourceDatabase(context, tables)
  const fetched: string[] = []
  const result = await collectGovernedWorldSourceDocuments({
    now: new Date('2026-10-03T12:00:00Z'),
    fetchImpl: async (input) => {
      fetched.push(String(input))
      return new Response('<main>Published official evidence</main>', { headers: { 'content-type': 'text/html' } })
    },
  })
  assert.equal(result.captured, 2)
  assert.equal(result.failed, 0)
  assert.equal(result.readiness, 'complete')
  assert.deepEqual(fetched, ['https://official.example/data/old-approved', 'https://official.example/data/old-probation'])
  assert.deepEqual(tables.world_source_document_captures.map((capture) => capture.source_id), ['old-approved', 'old-probation'])
  // Event contracts stop after their first capture, retaining a legitimate
  // zero-due result without a fetch or an admission change.
  const again = await collectGovernedWorldSourceDocuments({ now: new Date('2026-10-03T13:00:00Z'), fetchImpl: async () => { throw new Error('No source is due') } })
  assert.equal(again.captured, 0)
  assert.equal(again.failed, 0)
})

test('admitted source selection pages beyond 200 while collection remains bounded to 50', async (context) => {
  const sources = Array.from({ length: 205 }, (_, index) => registryRow(`approved-${String(index).padStart(3, '0')}`, index % 2 ? 'probation' : 'approved'))
  const tables = collectionTables(sources)
  const requests = await mockSourceDatabase(context, tables)
  const admitted = await fetchAdmittedWorldSources()
  assert.equal(admitted.length, 205)
  assert.equal(new Set(admitted.map((entry) => entry.id)).size, 205)
  assert.deepEqual(admitted.at(-1)?.domainIds, ['ai-power'])
  const pages = requests.filter((request) => request.pathname.endsWith('/world_source_registry'))
  assert.deepEqual(pages.map((request) => Number(request.searchParams.get('offset'))), [0, 200])
  let fetches = 0
  const result = await collectGovernedWorldSourceDocuments({
    limit: 100, fetchImpl: async () => {
      fetches += 1
      return new Response('<main>Official evidence</main>', { headers: { 'content-type': 'text/html' } })
    },
  })
  assert.equal(result.captured, 50)
  assert.equal(fetches, 50)
})

test('admitted source collection fails closed when the active contract does not permit its target', async (context) => {
  const tables = collectionTables([registryRow('old-approved')])
  tables.world_source_contract_versions[0].allowed_paths = ['/different-path']
  await mockSourceDatabase(context, tables)
  await assert.rejects(collectGovernedWorldSourceDocuments({ fetchImpl: async () => { throw new Error('Must not fetch an uncontracted target') } }), /does not permit path/)
  assert.equal(tables.world_source_document_captures.length, 0)
})

test('a later admitted-source page failure rejects collection rather than returning partial coverage', async (context) => {
  const sources = Array.from({ length: 205 }, (_, index) => registryRow(`approved-${String(index).padStart(3, '0')}`))
  const tables = collectionTables(sources)
  await mockSourceDatabase(context, tables, 200)
  await assert.rejects(collectGovernedWorldSourceDocuments({ fetchImpl: async () => { throw new Error('Incomplete source selection must not fetch') } }), /Unable to load admitted World sources: Source page unavailable/)
  assert.equal(tables.world_source_document_captures.length, 0)
})

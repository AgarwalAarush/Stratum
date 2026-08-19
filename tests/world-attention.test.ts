import assert from 'node:assert/strict'
import test from 'node:test'
import {
  DEFAULT_WORLD_ATTENTION_POLICY,
  canonicalWorldSourceFamily,
  classifyWorldSourceLane,
  routeWorldAttention,
  selectWorldModelCandidates,
  selectWorldSpecialistLenses,
  tuneWorldAttentionPolicy,
  type AttentionCandidate,
  type AttentionSource,
} from '../lib/markets/world-attention.ts'
import { WORLD_BENCHMARK_CASES } from '../lib/markets/world-benchmark.ts'
import { boundWorldSpecialistLenses } from '../lib/server/world-specialists.ts'

function source(overrides: Partial<AttentionSource> = {}): AttentionSource {
  return { id: 's1', title: 'Routine quarterly earnings beat estimates', url: 'https://financialmodelingprep.com/news/1', publisher: 'FMP stock news', publishedAt: '2026-08-18T10:00:00.000Z', fetchedAt: '2026-08-18T10:05:00.000Z', ...overrides }
}

function candidate(overrides: Partial<AttentionCandidate> = {}): AttentionCandidate {
  return {
    fingerprint: 'f1', title: 'Routine quarterly earnings beat estimates', summary: 'Issuer reports earnings', materiality: 25, novelty: 30,
    sourceDiversity: 1, claimState: 'reported', channels: [], geographies: [], thesisDependency: false, portfolioDependency: false,
    decisiveNewEvent: false, sources: [source()], firstSeenAt: '2026-08-18T10:00:00.000Z', ...overrides,
  }
}

test('routine FMP company stories remain company-only while system spillovers cross', () => {
  assert.equal(routeWorldAttention(candidate()).route, 'company_only')
  const spillover = candidate({ title: 'Major chip factory shutdown creates global capacity shortage', summary: 'Production shutdown constrains semiconductor supply', materiality: 80, novelty: 80 })
  assert.notEqual(routeWorldAttention(spillover).route, 'company_only')
})

test('official primary evidence is retained and decisive events route urgent', () => {
  const official = source({ title: 'Central bank confirms emergency intervention', url: 'https://federalreserve.gov/newsevents/1', publisher: 'Federal Reserve' })
  assert.equal(classifyWorldSourceLane(official), 'official_primary')
  const decision = routeWorldAttention(candidate({ title: official.title, summary: 'Officially confirmed emergency action', claimState: 'officially_confirmed', decisiveNewEvent: true, materiality: 85, sources: [official] }))
  assert.equal(decision.route, 'urgent')
  assert.ok(decision.reasons.some((reason) => reason.includes('official')))
})

test('ENSO is monitored and routes to the physical-economy specialist', () => {
  const enso = candidate({
    title: 'El Niño forecast could alter crops and hydropower', summary: 'ENSO monitoring points to weather, food, reservoir, and insurance risk',
    materiality: 50, novelty: 55, channels: ['climate', 'food', 'power'], sources: [source({ title: 'El Niño forecast', url: 'https://www.climate.gov/enso', publisher: 'NOAA Climate' })],
  })
  const decision = routeWorldAttention(enso)
  assert.ok(['monitor', 'investigate'].includes(decision.route))
  assert.equal(selectWorldSpecialistLenses(enso, 'investigate')[0], 'physical_economy')
})

test('syndicated copies collapse into one source family', () => {
  const a = source({ url: 'https://finance.yahoo.com/release/1', publisher: 'Yahoo Finance', metadata: { originalPublisher: 'Business Wire' } })
  const b = source({ url: 'https://www.msn.com/release/1', publisher: 'MSN', metadata: { originalPublisher: 'Business Wire' } })
  assert.equal(canonicalWorldSourceFamily(a), canonicalWorldSourceFamily(b))
})

test('attention budgets preserve lane fairness and cap model candidates', () => {
  const inputs = Array.from({ length: 80 }, (_, index) => candidate({ fingerprint: `f${index}`, title: `Global supply disruption ${index}`, summary: 'Persistent supply chain shortage and shipping disruption', materiality: 70, novelty: 70, sources: [source({ id: `s${index}`, title: `Global supply disruption ${index}`, url: `https://reuters.com/world/${index}`, publisher: 'Reuters' })] }))
  const decisions = selectWorldModelCandidates(inputs, DEFAULT_WORLD_ATTENTION_POLICY, new Date('2026-08-18T11:00:00.000Z'))
  assert.equal(decisions.filter((item) => item.attention.selectedForEnrichment).length, 30)
})

test('policy auto-tuning cannot move numeric controls by more than ten percent', () => {
  const tuned = tuneWorldAttentionPolicy(DEFAULT_WORLD_ATTENTION_POLICY, { urgentMagnitude: 10, investigateDimension: 100, laneBudgets: { global_reporting: 100 } })
  assert.equal(tuned.thresholds.urgentMagnitude, 63)
  assert.equal(tuned.thresholds.investigateDimension, 66)
  assert.equal(tuned.laneBudgets.global_reporting, 33)
})

test('seed benchmark covers 75-100 cases and every required family', () => {
  assert.ok(WORLD_BENCHMARK_CASES.length >= 75 && WORLD_BENCHMARK_CASES.length <= 100)
  const families = new Set(WORLD_BENCHMARK_CASES.map((item) => item.family))
  for (const family of ['iran', 'china_taiwan', 'authoritarianism', 'enso', 'sovereign_banking', 'export_controls', 'ai_power', 'routine_earnings', 'pr_syndication', 'contradictory_reporting']) assert.ok(families.has(family))
})

test('specialist routing enforces one urgent and at most two scheduled lenses', () => {
  const lenses = ['physical_economy', 'macro_finance', 'geopolitics_institutions'] as const
  assert.deepEqual(boundWorldSpecialistLenses([...lenses], 'urgent'), ['physical_economy'])
  assert.deepEqual(boundWorldSpecialistLenses([...lenses], 'scheduled'), ['physical_economy', 'macro_finance'])
})

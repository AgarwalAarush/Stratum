import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
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
import { WORLD_BENCHMARK_FAMILIES, WORLD_BENCHMARK_TARGET, classifyWorldBenchmarkFamily, type PersistedWorldBenchmarkCase } from '../lib/markets/world-benchmark.ts'
import { calculateWorldBenchmarkMetrics, selectBalancedWorldBenchmarkCandidates } from '../lib/server/world-benchmark.ts'
import { NEWS_TOPIC_FEEDS, NEWS_TOPICS } from '../lib/data/rss.ts'
import { boundWorldSpecialistLenses } from '../lib/server/world-specialists.ts'
import { clusterWorldEventSources, mapWorldEventBatchesWithConcurrency } from '../lib/server/world-events.ts'
import { selectWorldSignalRelations, shouldPersistWorldSignal, worldSignalActivationConditions, worldSignalActivationSatisfied } from '../lib/server/world-signals.ts'

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

test('broad World sensing includes macro, institutions, resources, demographics, and explicit ENSO discovery', () => {
  for (const topic of ['global-macro-finance', 'institutions-governance', 'energy-resources', 'demographics-migration'] as const) {
    assert.ok(NEWS_TOPICS.includes(topic))
    assert.ok(NEWS_TOPIC_FEEDS[topic].length >= 3)
  }
  assert.ok(NEWS_TOPIC_FEEDS['climate-environment'].some((feed) => /ENSO/.test(feed.name)))
})

test('event enrichment uses bounded concurrency so three sensor batches do not run serially', async () => {
  let active = 0
  let maximumActive = 0
  await mapWorldEventBatchesWithConcurrency([0, 1, 2], async () => {
    active += 1
    maximumActive = Math.max(maximumActive, active)
    await new Promise((resolve) => setTimeout(resolve, 10))
    active -= 1
    return []
  }, 2)
  assert.equal(maximumActive, 2)
  assert.equal(active, 0)
})

test('policy auto-tuning cannot move numeric controls by more than ten percent', () => {
  const tuned = tuneWorldAttentionPolicy(DEFAULT_WORLD_ATTENTION_POLICY, { urgentMagnitude: 10, investigateDimension: 100, laneBudgets: { global_reporting: 100 } })
  assert.equal(tuned.thresholds.urgentMagnitude, 63)
  assert.equal(tuned.thresholds.investigateDimension, 66)
  assert.equal(tuned.laneBudgets.global_reporting, 33)
})

test('benchmark defines a 75-100 real-case target and every required family without synthetic prompt copies', () => {
  assert.deepEqual(WORLD_BENCHMARK_TARGET, { minimum: 75, maximum: 100 })
  const families = new Set(WORLD_BENCHMARK_FAMILIES.map((item) => item.id))
  for (const family of ['iran', 'china_taiwan', 'authoritarianism', 'enso', 'sovereign_banking', 'export_controls', 'ai_power', 'routine_earnings', 'pr_syndication', 'contradictory_reporting']) assert.ok(families.has(family))
  assert.equal(classifyWorldBenchmarkFamily({ title: 'El Niño raises hydropower risk' }).family, 'enso')
  assert.equal(classifyWorldBenchmarkFamily({ title: 'Company announces product', sourceLane: 'pr_syndication' }).family, 'pr_syndication')
})

test('benchmark selection reserves room for every family present before filling deeper cases', () => {
  const candidates = [
    ...Array.from({ length: 20 }, (_, index) => ({ id: `iran-${index}`, classification: { family: 'iran' } })),
    { id: 'enso-1', classification: { family: 'enso' } },
    { id: 'sovereign-1', classification: { family: 'sovereign_banking' } },
  ]
  const selected = selectBalancedWorldBenchmarkCandidates(candidates, 5)
  assert.deepEqual(new Set(selected.map((item) => item.classification.family)), new Set(['enso', 'iran', 'sovereign_banking']))
})

test('benchmark metrics separate recall, exact route, noise rejection, and specialist accuracy', () => {
  const benchmarkCase = (overrides: Partial<PersistedWorldBenchmarkCase & { actualRoute: 'urgent' | 'investigate' | 'monitor' | 'awareness' | 'company_only' | 'noise' | null; actualSpecialistLenses: string[] }> = {}) => ({
    id: 'case-1', eventClusterId: 'event-1', family: 'iran', title: 'Iran escalation', materiality: 90, officialPrimary: true,
    sourceIds: ['feed:1'], sourceUrls: ['https://example.com/1'], observedRoute: 'urgent' as const, observedSpecialistLenses: ['geopolitics_institutions' as const],
    expectedRoute: 'urgent' as const, expectedPrimaryLens: 'geopolitics_institutions' as const, hardCase: true, status: 'confirmed' as const,
    actualRoute: 'urgent' as const, actualSpecialistLenses: ['geopolitics_institutions'], ...overrides,
  })
  const evaluated = calculateWorldBenchmarkMetrics([
    benchmarkCase(),
    benchmarkCase({ id: 'case-2', eventClusterId: 'event-2', family: 'viral_noise', officialPrimary: false, expectedRoute: 'noise', expectedPrimaryLens: null, hardCase: false, actualRoute: 'awareness', actualSpecialistLenses: [] }),
  ])
  assert.equal(evaluated.metrics.highMaterialityRecall, 1)
  assert.equal(evaluated.metrics.officialPrimaryRecall, 1)
  assert.equal(evaluated.metrics.routeAccuracy, 0.5)
  assert.equal(evaluated.metrics.noiseRejection, 0)
  assert.equal(evaluated.metrics.specialistAccuracy, 1)
})

test('specialist routing enforces one urgent and at most two scheduled lenses', () => {
  const lenses = ['physical_economy', 'macro_finance', 'geopolitics_institutions'] as const
  assert.deepEqual(boundWorldSpecialistLenses([...lenses], 'urgent'), ['physical_economy'])
  assert.deepEqual(boundWorldSpecialistLenses([...lenses], 'scheduled'), ['physical_economy', 'macro_finance'])
})

test('historical event chronology follows published time while retaining fetched provenance', () => {
  const laterFetchedFirstPublished = source({ id: 'early', title: 'Iran shipping disruption begins', publishedAt: '2025-08-01T00:00:00.000Z', fetchedAt: '2026-08-18T11:00:00.000Z', url: 'https://reuters.com/a', publisher: 'Reuters' })
  const earlierFetchedLaterPublished = source({ id: 'late', title: 'Iran shipping disruption expands', publishedAt: '2025-08-03T00:00:00.000Z', fetchedAt: '2026-08-18T10:00:00.000Z', url: 'https://apnews.com/b', publisher: 'AP News' })
  const clusters = clusterWorldEventSources([earlierFetchedLaterPublished, laterFetchedFirstPublished], new Date('2026-08-18T12:00:00.000Z'))
  assert.equal(clusters[0].firstSeenAt, '2025-08-01T00:00:00.000Z')
  assert.equal(clusters[0].eventAt, '2025-08-01T00:00:00.000Z')
  assert.equal(clusters[0].sources[0].fetchedAt, '2026-08-18T11:00:00.000Z')
})

test('dormant ENSO activation conditions reactivate on compound crop, power, or insurance evidence', () => {
  const conditions = ['crop failure or food-price disruption', 'hydropower or reservoir stress', 'insurance losses or commodity disruption']
  assert.equal(worldSignalActivationSatisfied(conditions, 'New drought evidence shows crop losses and reservoir stress'), true)
  assert.equal(worldSignalActivationSatisfied(conditions, 'A routine quarterly earnings release'), false)
  assert.equal(worldSignalActivationSatisfied(conditions, 'Semiconductor inventory and export controls tightened'), false)
})

test('weak-signal linking requires compound structure and caps activation versus association links', () => {
  const cluster = { actors: ['China', 'TSMC'], geographies: ['Taiwan'], channels: ['semiconductor', 'shipping'] }
  const candidates = [
    { id: 'generic-channel', status: 'observed' as const, entities: [], geographies: [], channels: ['shipping'], activates: false },
    { id: 'compound', status: 'observed' as const, entities: ['China'], geographies: ['Taiwan'], channels: [], activates: false },
    ...Array.from({ length: 5 }, (_, index) => ({ id: `activation-${index}`, status: 'dormant' as const, entities: [], geographies: [], channels: [], activates: true })),
    ...Array.from({ length: 8 }, (_, index) => ({ id: `association-${index}`, status: 'observed' as const, entities: ['China'], geographies: ['Taiwan'], channels: ['shipping'], activates: false })),
  ]
  const selected = selectWorldSignalRelations(cluster, candidates)
  assert.equal(selected.some((item) => item.id === 'generic-channel'), false)
  assert.equal(selected.filter((item) => item.activates).length, 3)
  assert.equal(selected.filter((item) => !item.activates).length, 5)
  assert.equal(selected.length, 8)
})

test('ENSO matching uses word boundaries and cannot be triggered by unrelated words', () => {
  for (const title of ['A tool that removes censorship from open-weight LLMs', 'Quantum magnetic sensors improve GPS resilience', 'Stephenson Harwood legal update']) {
    const item = candidate({ title, summary: title, channels: [], geographies: [] })
    assert.deepEqual(worldSignalActivationConditions(item as ReturnType<typeof clusterWorldEventSources>[number]), ['new corroborating evidence establishes a durable economic channel'])
  }
  const enso = candidate({ title: 'ENSO outlook shifts toward El Niño', summary: 'The Pacific cycle may alter weather', channels: ['climate'] })
  assert.deepEqual(worldSignalActivationConditions(enso as ReturnType<typeof clusterWorldEventSources>[number]), [
    'crop failure or food-price disruption',
    'hydropower or reservoir stress',
    'insurance losses or commodity disruption',
  ])
})

test('signal hygiene migration demotes without deleting immutable weak-signal history', () => {
  const migration = readFileSync(new URL('../supabase/migrations/202608190002_world_signal_hygiene.sql', import.meta.url), 'utf8')
  assert.match(migration, /set status = 'dormant'/)
  assert.match(migration, /new corroborating evidence establishes a durable economic channel/)
  assert.doesNotMatch(migration, /delete\s+from\s+public\.world_signals/i)
})

test('compact weak-signal memory excludes low-information awareness without deleting its event', () => {
  const lowInformation = candidate({
    title: 'Self-Portrait by Ernst Mach', summary: 'A historical image', materiality: 15, novelty: 45,
    channels: [], geographies: [], sources: [source({ title: 'Self-Portrait by Ernst Mach', url: 'https://example.org/mach', publisher: 'Example' })],
  })
  const awareness = routeWorldAttention(lowInformation)
  assert.equal(awareness.route, 'awareness')
  assert.equal(shouldPersistWorldSignal(lowInformation as ReturnType<typeof clusterWorldEventSources>[number], awareness), false)

  const enso = candidate({
    title: 'ENSO outlook shifts toward El Niño', summary: 'Climate outlook may affect crops and hydropower', materiality: 45, novelty: 50,
    channels: ['climate'], geographies: ['Pacific'], sources: [source({ title: 'ENSO outlook shifts toward El Niño', url: 'https://climate.gov/enso', publisher: 'NOAA' })],
  })
  assert.equal(shouldPersistWorldSignal(enso as ReturnType<typeof clusterWorldEventSources>[number], routeWorldAttention(enso)), true)
})

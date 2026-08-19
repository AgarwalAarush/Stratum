import { MARKETS_OWNER_ID } from '../auth/markets-auth.ts'
import { classifyWorldBenchmarkFamily, WORLD_BENCHMARK_TARGET, type PersistedWorldBenchmarkCase } from '../markets/world-benchmark.ts'
import { WORLD_ATTENTION_ROUTES, WORLD_SPECIALIST_LENSES, type WorldAttentionRoute, type WorldSpecialistLens, type WorldSourceLane } from '../markets/world-attention.ts'
import { getSupabaseClient } from './supabase.ts'
import { loadWorldAttentionPolicySet } from './world-governance.ts'

interface BenchmarkEventRow { id: string; title: string; summary: string; materiality: number; source_ids: string[]; last_seen_at: string }

function normalizeCase(row: Record<string, unknown>): PersistedWorldBenchmarkCase {
  return {
    id: String(row.id), eventClusterId: String(row.event_cluster_id), family: String(row.family), title: String(row.title),
    materiality: Number(row.materiality), officialPrimary: row.official_primary === true,
    sourceIds: Array.isArray(row.source_ids) ? row.source_ids.filter((value): value is string => typeof value === 'string') : [],
    sourceUrls: Array.isArray(row.source_urls) ? row.source_urls.filter((value): value is string => typeof value === 'string') : [],
    observedRoute: String(row.observed_route) as WorldAttentionRoute,
    observedSpecialistLenses: Array.isArray(row.observed_specialist_lenses) ? row.observed_specialist_lenses.filter((value): value is WorldSpecialistLens => typeof value === 'string' && WORLD_SPECIALIST_LENSES.includes(value as WorldSpecialistLens)) : [],
    expectedRoute: typeof row.expected_route === 'string' ? row.expected_route as WorldAttentionRoute : null,
    expectedPrimaryLens: typeof row.expected_primary_lens === 'string' ? row.expected_primary_lens as WorldSpecialistLens : null,
    hardCase: row.hard_case === true, status: String(row.status) as PersistedWorldBenchmarkCase['status'],
  }
}

export async function seedWorldBenchmarkFromEventLedger(limit = WORLD_BENCHMARK_TARGET.maximum): Promise<{ selected: number; families: number }> {
  const supabase = getSupabaseClient()
  if (!supabase) throw new Error('Supabase service credentials are not configured')
  const { active } = await loadWorldAttentionPolicySet()
  const { data: events, error } = await supabase.from('world_event_clusters').select('id,title,summary,materiality,source_ids,last_seen_at').order('materiality', { ascending: false }).order('last_seen_at', { ascending: false }).limit(1_000)
  if (error) throw new Error(`Unable to load benchmark event candidates: ${error.message}`)
  const eventIds = (events ?? []).map((event) => String(event.id))
  if (eventIds.length === 0) return { selected: 0, families: 0 }
  const decisionRows: Array<Record<string, unknown>> = []
  const sourceRows: Array<Record<string, unknown>> = []
  for (let index = 0; index < eventIds.length; index += 200) {
    const ids = eventIds.slice(index, index + 200)
    const [decisionResult, sourceResult] = await Promise.all([
      supabase.from('world_attention_decisions').select('event_cluster_id,route,source_lane,specialist_lenses,decided_at').eq('policy_version', active.version).in('event_cluster_id', ids).order('decided_at', { ascending: false }),
      supabase.from('world_event_cluster_sources').select('cluster_id,source_id,url,source_lane').in('cluster_id', ids),
    ])
    if (decisionResult.error) throw new Error(`Unable to load benchmark attention decisions: ${decisionResult.error.message}`)
    if (sourceResult.error) throw new Error(`Unable to load benchmark source lineage: ${sourceResult.error.message}`)
    decisionRows.push(...(decisionResult.data ?? []) as Array<Record<string, unknown>>)
    sourceRows.push(...(sourceResult.data ?? []) as Array<Record<string, unknown>>)
  }
  const decisions = new Map<string, Record<string, unknown>>()
  for (const decision of decisionRows) if (!decisions.has(String(decision.event_cluster_id))) decisions.set(String(decision.event_cluster_id), decision)
  const sources = new Map<string, Array<Record<string, unknown>>>()
  for (const source of sourceRows) sources.set(String(source.cluster_id), [...(sources.get(String(source.cluster_id)) ?? []), source])
  const classified = ((events ?? []) as BenchmarkEventRow[]).flatMap((event) => {
    const decision = decisions.get(event.id)
    if (!decision || !WORLD_ATTENTION_ROUTES.includes(String(decision.route) as WorldAttentionRoute)) return []
    const sourceLane = typeof decision.source_lane === 'string' ? decision.source_lane as WorldSourceLane : null
    const classification = classifyWorldBenchmarkFamily({ title: event.title, summary: event.summary, sourceLane, route: decision.route as WorldAttentionRoute })
    return [{ event, decision, classification, sources: sources.get(event.id) ?? [] }]
  })
  const byFamily = new Map<string, typeof classified>()
  for (const item of classified) byFamily.set(item.classification.family, [...(byFamily.get(item.classification.family) ?? []), item])
  const selected: typeof classified = []
  let round = 0
  while (selected.length < Math.min(limit, classified.length)) {
    let added = false
    for (const family of [...byFamily.keys()].sort()) {
      const item = byFamily.get(family)?.[round]
      if (item) { selected.push(item); added = true }
      if (selected.length >= limit) break
    }
    if (!added) break
    round += 1
  }
  const rows = selected.map(({ event, decision, classification, sources: eventSources }) => ({
    event_cluster_id: event.id, family: classification.family, title: event.title, materiality: event.materiality,
    official_primary: eventSources.some((source) => source.source_lane === 'official_primary'), source_ids: event.source_ids ?? [],
    source_urls: [...new Set(eventSources.map((source) => String(source.url)).filter(Boolean))], observed_route: decision.route,
    observed_specialist_lenses: Array.isArray(decision.specialist_lenses) ? decision.specialist_lenses : [], hard_case: classification.hardCase,
    as_of: event.last_seen_at, updated_at: new Date().toISOString(),
  }))
  if (rows.length) {
    const { error: upsertError } = await supabase.from('world_benchmark_cases').upsert(rows, { onConflict: 'event_cluster_id', ignoreDuplicates: false })
    if (upsertError) throw new Error(`Unable to persist real benchmark cases: ${upsertError.message}`)
  }
  return { selected: rows.length, families: new Set(rows.map((row) => row.family)).size }
}

export async function labelWorldBenchmarkCase(input: { caseId: string; ownerId?: string; status: 'confirmed' | 'rejected'; expectedRoute?: WorldAttentionRoute; expectedPrimaryLens?: WorldSpecialistLens; notes?: string }): Promise<void> {
  const supabase = getSupabaseClient()
  if (!supabase) throw new Error('Supabase service credentials are not configured')
  if (input.status === 'confirmed' && !input.expectedRoute) throw new Error('A confirmed benchmark case requires an expected route')
  const { error } = await supabase.from('world_benchmark_cases').update({
    status: input.status, expected_route: input.status === 'confirmed' ? input.expectedRoute : null,
    expected_primary_lens: input.status === 'confirmed' ? input.expectedPrimaryLens ?? null : null,
    owner_notes: input.notes?.trim().slice(0, 2_000) || null, labeled_by: input.ownerId ?? MARKETS_OWNER_ID,
    labeled_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  }).eq('id', input.caseId)
  if (error) throw new Error(`Unable to label benchmark case: ${error.message}`)
}

export function calculateWorldBenchmarkMetrics(cases: Array<PersistedWorldBenchmarkCase & { actualRoute: WorldAttentionRoute | null; actualSpecialistLenses: string[] }>): { metrics: Record<string, number>; hardRegressions: string[]; results: Array<Record<string, unknown>> } {
  const importantRoutes = new Set<WorldAttentionRoute>(['urgent', 'investigate', 'monitor'])
  let important = 0; let recalled = 0; let officialImportant = 0; let officialRecalled = 0; let routeCorrect = 0; let noiseCases = 0; let noiseRejected = 0; let lensCases = 0; let lensCorrect = 0
  const hardRegressions: string[] = []
  const results = cases.map((item) => {
    const expectedImportant = importantRoutes.has(item.expectedRoute!)
    const actualImportant = item.actualRoute ? importantRoutes.has(item.actualRoute) : false
    if (expectedImportant) { important += 1; if (actualImportant) recalled += 1 }
    if (item.officialPrimary && expectedImportant) { officialImportant += 1; if (actualImportant) officialRecalled += 1 }
    if (item.actualRoute === item.expectedRoute) routeCorrect += 1
    if (item.expectedRoute === 'noise' || item.expectedRoute === 'company_only') { noiseCases += 1; if (item.actualRoute === item.expectedRoute) noiseRejected += 1 }
    if (item.expectedPrimaryLens) { lensCases += 1; if (item.actualSpecialistLenses.includes(item.expectedPrimaryLens)) lensCorrect += 1 }
    const passed = item.actualRoute === item.expectedRoute && (!item.expectedPrimaryLens || item.actualSpecialistLenses.includes(item.expectedPrimaryLens))
    if (item.hardCase && !passed) hardRegressions.push(item.id)
    return { benchmark_case_id: item.id, actual_route: item.actualRoute, actual_specialist_lenses: item.actualSpecialistLenses, route_correct: item.actualRoute === item.expectedRoute, specialist_correct: item.expectedPrimaryLens ? item.actualSpecialistLenses.includes(item.expectedPrimaryLens) : null, passed }
  })
  return { metrics: { labeledCases: cases.length, highMaterialityRecall: important ? recalled / important : 0, officialPrimaryRecall: officialImportant ? officialRecalled / officialImportant : 0, routeAccuracy: cases.length ? routeCorrect / cases.length : 0, noiseRejection: noiseCases ? noiseRejected / noiseCases : 0, specialistAccuracy: lensCases ? lensCorrect / lensCases : 0 }, hardRegressions, results }
}

export async function evaluateWorldBenchmark(policyVersion?: string): Promise<{ runId: string; metrics: Record<string, number>; hardRegressions: string[] }> {
  const supabase = getSupabaseClient()
  if (!supabase) throw new Error('Supabase service credentials are not configured')
  const { active } = await loadWorldAttentionPolicySet()
  const version = policyVersion ?? active.version
  const { data: cases, error } = await supabase.from('world_benchmark_cases').select('*').eq('status', 'confirmed').not('expected_route', 'is', null).order('materiality', { ascending: false })
  if (error) throw new Error(`Unable to load labeled benchmark: ${error.message}`)
  const normalized = (cases ?? []).map((row) => normalizeCase(row as Record<string, unknown>))
  const eventIds = normalized.map((item) => item.eventClusterId)
  const { data: decisions, error: decisionError } = eventIds.length ? await supabase.from('world_attention_decisions').select('event_cluster_id,route,specialist_lenses').eq('policy_version', version).in('event_cluster_id', eventIds) : { data: [], error: null }
  if (decisionError) throw new Error(`Unable to evaluate benchmark decisions: ${decisionError.message}`)
  const byEvent = new Map((decisions ?? []).map((decision) => [String(decision.event_cluster_id), decision]))
  const evaluated = normalized.map((item) => {
    const decision = byEvent.get(item.eventClusterId)
    return { ...item, actualRoute: typeof decision?.route === 'string' ? decision.route as WorldAttentionRoute : null, actualSpecialistLenses: Array.isArray(decision?.specialist_lenses) ? decision.specialist_lenses.filter((value): value is string => typeof value === 'string') : [] }
  })
  const { metrics, hardRegressions, results } = calculateWorldBenchmarkMetrics(evaluated)
  const { data: run, error: runError } = await supabase.from('world_benchmark_runs').insert({ policy_version: version, case_count: normalized.length, metrics, hard_case_regressions: hardRegressions, status: normalized.length >= WORLD_BENCHMARK_TARGET.minimum ? 'completed' : 'insufficient_labels', finished_at: new Date().toISOString() }).select('id').single()
  if (runError || !run) throw new Error(`Unable to persist benchmark run: ${runError?.message ?? 'unknown error'}`)
  if (results.length) {
    const { error: resultError } = await supabase.from('world_benchmark_results').insert(results.map((row) => ({ ...row, benchmark_run_id: run.id })))
    if (resultError) throw new Error(`Unable to persist benchmark results: ${resultError.message}`)
  }
  return { runId: String(run.id), metrics, hardRegressions }
}

export async function fetchWorldBenchmarkSnapshot(): Promise<{ cases: PersistedWorldBenchmarkCase[]; runs: Array<Record<string, unknown>>; target: typeof WORLD_BENCHMARK_TARGET }> {
  const supabase = getSupabaseClient()
  if (!supabase) return { cases: [], runs: [], target: WORLD_BENCHMARK_TARGET }
  const [caseResult, runResult] = await Promise.all([
    supabase.from('world_benchmark_cases').select('*').order('status', { ascending: false }).order('materiality', { ascending: false }).limit(WORLD_BENCHMARK_TARGET.maximum),
    supabase.from('world_benchmark_runs').select('*').order('started_at', { ascending: false }).limit(10),
  ])
  if (caseResult.error) throw new Error(`Unable to load World benchmark cases: ${caseResult.error.message}`)
  if (runResult.error) throw new Error(`Unable to load World benchmark runs: ${runResult.error.message}`)
  return { cases: (caseResult.data ?? []).map((row) => normalizeCase(row as Record<string, unknown>)), runs: (runResult.data ?? []) as Array<Record<string, unknown>>, target: WORLD_BENCHMARK_TARGET }
}

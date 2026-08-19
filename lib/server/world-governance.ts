import { randomUUID } from 'node:crypto'
import { MARKETS_OWNER_ID } from '../auth/markets-auth.ts'
import { DEFAULT_WORLD_ATTENTION_POLICY, WORLD_SOURCE_LANES, primaryWorldSourceLane, routeWorldAttention, tuneWorldAttentionPolicy, type AttentionCandidate, type WorldAttentionPolicy, type WorldSourceLane } from '../markets/world-attention.ts'
import { getSupabaseClient } from './supabase.ts'

export type WorldReviewCategory = 'suspected_miss' | 'false_positive' | 'promoted_change' | 'compound_link' | 'coverage_problem'

export interface WorldReviewItem {
  category: WorldReviewCategory
  subjectType: 'event' | 'signal' | 'node' | 'link' | 'source' | 'policy'
  subjectId: string
  title: string
  detail: string
  label: string | null
  notes: string | null
}

export interface WorldGovernanceSnapshot {
  laneVolumes: Array<{ lane: string; count: number }>
  routeVolumes: Array<{ route: string; count: number }>
  sourceFamilies: Array<{ family: string; count: number }>
  signals: Array<Record<string, unknown>>
  links: Array<Record<string, unknown>>
  specialists: Array<Record<string, unknown>>
  policies: Array<Record<string, unknown>>
  experiments: Array<Record<string, unknown>>
  weeklyReview: WorldReviewItem[]
}

function parsePolicy(row: { version?: unknown; policy?: unknown } | null | undefined): WorldAttentionPolicy | null {
  if (!row || typeof row.version !== 'string' || !row.policy || typeof row.policy !== 'object') return null
  const input = row.policy as Partial<WorldAttentionPolicy>
  if (!input.laneBudgets || !input.thresholds || typeof input.totalModelCandidates !== 'number') return null
  return { version: row.version, laneBudgets: input.laneBudgets as Record<WorldSourceLane, number>, totalModelCandidates: input.totalModelCandidates, thresholds: input.thresholds as WorldAttentionPolicy['thresholds'] }
}

export async function loadWorldAttentionPolicySet(): Promise<{ active: WorldAttentionPolicy; shadow: WorldAttentionPolicy[] }> {
  const supabase = getSupabaseClient()
  if (!supabase) return { active: DEFAULT_WORLD_ATTENTION_POLICY, shadow: [] }
  const { data, error } = await supabase.from('world_attention_policy_versions').select('version,status,policy').in('status', ['active', 'shadow']).order('created_at', { ascending: false })
  if (error && (error.code === '42P01' || error.code === 'PGRST205')) return { active: DEFAULT_WORLD_ATTENTION_POLICY, shadow: [] }
  if (error) throw new Error(`Unable to load World attention policies: ${error.message}`)
  const policies = (data ?? []).map(parsePolicy).filter((policy): policy is WorldAttentionPolicy => Boolean(policy))
  const activeRow = (data ?? []).find((row) => row.status === 'active')
  return { active: parsePolicy(activeRow) ?? DEFAULT_WORLD_ATTENTION_POLICY, shadow: policies.filter((policy) => policy.version !== activeRow?.version) }
}

export async function recordShadowWorldAttentionDecisions(eventClusterId: string, candidate: AttentionCandidate, policies: WorldAttentionPolicy[]): Promise<void> {
  if (policies.length === 0) return
  const supabase = getSupabaseClient()
  if (!supabase) return
  const rows = policies.map((policy) => {
    const decision = routeWorldAttention(candidate, policy)
    return { event_cluster_id: eventClusterId, policy_version: policy.version, source_lane: primaryWorldSourceLane(candidate.sources), route: decision.route, dimensions: decision.dimensions, reasons: decision.reasons, selected_for_enrichment: ['urgent', 'investigate', 'monitor'].includes(decision.route), specialist_lenses: decision.specialistLenses, decided_at: new Date().toISOString() }
  })
  for (const row of rows) {
    const { error } = await supabase.from('world_attention_decisions').upsert(row, { onConflict: 'event_cluster_id,policy_version' })
    if (error) throw new Error(`Unable to persist shadow attention decision: ${error.message}`)
  }
}

export async function startWorldPolicyExperiment(changes: Partial<WorldAttentionPolicy['thresholds']> & { laneBudgets?: Partial<Record<WorldSourceLane, number>> }, ownerId = MARKETS_OWNER_ID): Promise<{ experimentId: string; candidateVersion: string }> {
  const supabase = getSupabaseClient()
  if (!supabase) throw new Error('Supabase service credentials are not configured')
  const { active } = await loadWorldAttentionPolicySet()
  const candidate = tuneWorldAttentionPolicy(active, changes)
  const candidateVersion = `${active.version}-shadow-${new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 12)}`
  candidate.version = candidateVersion
  const policyPayload = { laneBudgets: candidate.laneBudgets, totalModelCandidates: candidate.totalModelCandidates, thresholds: candidate.thresholds }
  const { error: policyError } = await supabase.from('world_attention_policy_versions').insert({ version: candidateVersion, status: 'shadow', policy: policyPayload, parent_version: active.version, change_summary: 'Owner-created bounded numeric policy experiment.', created_by: ownerId })
  if (policyError) throw new Error(`Unable to create World policy candidate: ${policyError.message}`)
  const experimentId = randomUUID()
  const { error } = await supabase.from('world_policy_experiments').insert({ id: experimentId, baseline_version: active.version, candidate_version: candidateVersion, status: 'shadow', ends_at: new Date(Date.now() + 7 * 24 * 60 * 60_000).toISOString() })
  if (error) throw new Error(`Unable to start World policy experiment: ${error.message}`)
  return { experimentId, candidateVersion }
}

export async function rollbackWorldPolicy(version: string): Promise<void> {
  const supabase = getSupabaseClient()
  if (!supabase) throw new Error('Supabase service credentials are not configured')
  const { data: target, error: targetError } = await supabase.from('world_attention_policy_versions').select('version').eq('version', version).maybeSingle()
  if (targetError || !target) throw new Error(`Rollback policy ${version} does not exist`)
  const { data: active } = await supabase.from('world_attention_policy_versions').select('version').eq('status', 'active').maybeSingle()
  if (active?.version === version) return
  const { error } = await supabase.rpc('promote_world_attention_policy', { p_version: version })
  if (error) throw new Error(`Unable to roll back World attention policy: ${error.message}`)
  await supabase.from('world_policy_experiments').update({ status: 'rolled_back', finished_at: new Date().toISOString(), updated_at: new Date().toISOString() }).or(`baseline_version.eq.${version},candidate_version.eq.${version}`).eq('status', 'promoted')
}

export async function evaluateDueWorldPolicyExperiments(now = new Date()): Promise<Array<{ id: string; status: string; reason?: string }>> {
  const supabase = getSupabaseClient()
  if (!supabase) return []
  const { data: experiments, error } = await supabase.from('world_policy_experiments').select('*').eq('status', 'shadow').lte('ends_at', now.toISOString())
  if (error) throw new Error(`Unable to load due World policy experiments: ${error.message}`)
  const results = []
  for (const experiment of experiments ?? []) {
    const [{ data: decisions }, { data: labels }] = await Promise.all([
      supabase.from('world_attention_decisions').select('event_cluster_id,policy_version,route,selected_for_enrichment').in('policy_version', [experiment.baseline_version, experiment.candidate_version]).gte('decided_at', experiment.started_at),
      supabase.from('world_review_labels').select('subject_id,category,label').eq('owner_id', MARKETS_OWNER_ID).eq('subject_type', 'event').gte('created_at', experiment.started_at),
    ])
    const labelMap = new Map((labels ?? []).map((label) => [String(label.subject_id), String(label.label)]))
    const score = (version: string) => {
      const rows = (decisions ?? []).filter((decision) => decision.policy_version === version && labelMap.has(String(decision.event_cluster_id)))
      let important = 0; let predicted = 0; let truePositive = 0
      for (const row of rows) {
        const expected = ['important', 'correct', 'useful'].includes(labelMap.get(String(row.event_cluster_id))!)
        const prediction = ['urgent', 'investigate', 'monitor'].includes(String(row.route))
        if (expected) important += 1
        if (prediction) predicted += 1
        if (expected && prediction) truePositive += 1
      }
      return { labeled: rows.length, important, predicted, truePositive, recall: important ? truePositive / important : 0, precision: predicted ? truePositive / predicted : 1, selected: (decisions ?? []).filter((decision) => decision.policy_version === version && decision.selected_for_enrichment === true).length }
    }
    const baseline = score(String(experiment.baseline_version))
    const candidate = score(String(experiment.candidate_version))
    const hardRegressions = (labels ?? []).filter((label) => label.category === 'suspected_miss' && label.label === 'important').filter((label) => {
      const baselineDecision = (decisions ?? []).find((decision) => decision.policy_version === experiment.baseline_version && String(decision.event_cluster_id) === String(label.subject_id))
      const candidateDecision = (decisions ?? []).find((decision) => decision.policy_version === experiment.candidate_version && String(decision.event_cluster_id) === String(label.subject_id))
      return baselineDecision && candidateDecision && ['urgent', 'investigate', 'monitor'].includes(String(baselineDecision.route)) && !['urgent', 'investigate', 'monitor'].includes(String(candidateDecision.route))
    }).map((label) => String(label.subject_id))
    const enoughLabels = Math.min(baseline.labeled, candidate.labeled) >= 20
    const recallPass = candidate.truePositive >= baseline.truePositive + 1 || candidate.recall >= baseline.recall + 0.02
    const precisionPass = candidate.precision >= baseline.precision - 0.02
    const costPass = candidate.selected <= Math.max(1, baseline.selected) * 1.1
    const passed = enoughLabels && recallPass && precisionPass && costPass && hardRegressions.length === 0
    const metrics = { ...candidate, recallDelta: candidate.recall - baseline.recall, precisionDelta: candidate.precision - baseline.precision, selectedCostRatio: candidate.selected / Math.max(1, baseline.selected) }
    if (passed) {
      const { error: promoteError } = await supabase.rpc('promote_world_attention_policy', { p_version: experiment.candidate_version })
      if (promoteError) throw new Error(`Unable to auto-promote World policy: ${promoteError.message}`)
      await supabase.from('world_policy_experiments').update({ status: 'promoted', baseline_metrics: baseline, candidate_metrics: metrics, hard_case_regressions: [], finished_at: now.toISOString(), updated_at: now.toISOString() }).eq('id', experiment.id)
      results.push({ id: String(experiment.id), status: 'promoted' })
    } else {
      const reason = !enoughLabels ? 'Insufficient owner-labeled cases' : !recallPass ? 'Recall did not improve' : !precisionPass ? 'Precision regressed by more than two points' : !costPass ? 'Model-enrichment cost rose by more than ten percent' : 'A hard benchmark case regressed'
      await supabase.from('world_attention_policy_versions').update({ status: 'rejected', updated_at: now.toISOString() }).eq('version', experiment.candidate_version)
      await supabase.from('world_policy_experiments').update({ status: 'failed', baseline_metrics: baseline, candidate_metrics: metrics, hard_case_regressions: hardRegressions, failure_reason: reason, finished_at: now.toISOString(), updated_at: now.toISOString() }).eq('id', experiment.id)
      results.push({ id: String(experiment.id), status: 'failed', reason })
    }
  }
  return results
}

export async function labelWorldReview(input: { ownerId?: string; category: WorldReviewCategory; subjectType: WorldReviewItem['subjectType']; subjectId: string; label: string; notes?: string }): Promise<void> {
  const supabase = getSupabaseClient()
  if (!supabase) throw new Error('Supabase service credentials are not configured')
  const now = new Date()
  const reviewWeek = new Date(now.getTime() - ((now.getUTCDay() + 6) % 7) * 24 * 60 * 60_000).toISOString().slice(0, 10)
  const { error } = await supabase.from('world_review_labels').upsert({ owner_id: input.ownerId ?? MARKETS_OWNER_ID, review_week: reviewWeek, category: input.category, subject_type: input.subjectType, subject_id: input.subjectId, label: input.label, notes: input.notes?.trim().slice(0, 2_000) || null, updated_at: new Date().toISOString() }, { onConflict: 'owner_id,review_week,category,subject_type,subject_id' })
  if (error) throw new Error(`Unable to record World review label: ${error.message}`)
}

const countBy = (rows: Array<Record<string, unknown>>, key: string): Array<{ lane: string; count: number }> => {
  const counts = new Map<string, number>()
  for (const row of rows) if (typeof row[key] === 'string') counts.set(row[key] as string, (counts.get(row[key] as string) ?? 0) + 1)
  return [...counts].map(([lane, count]) => ({ lane, count })).sort((a, b) => b.count - a.count)
}

export async function fetchWorldGovernanceSnapshot(): Promise<WorldGovernanceSnapshot> {
  const supabase = getSupabaseClient()
  if (!supabase) return { laneVolumes: [], routeVolumes: [], sourceFamilies: [], signals: [], links: [], specialists: [], policies: [], experiments: [], weeklyReview: [] }
  const since = new Date(Date.now() - 7 * 24 * 60 * 60_000).toISOString()
  const [decisionsResult, sourceResult, signalResult, linkResult, specialistResult, policyResult, experimentResult, labelsResult, promotedResult, coverageResult] = await Promise.all([
    supabase.from('world_attention_decisions').select('event_cluster_id,policy_version,source_lane,route,dimensions,reasons,decided_at').gte('decided_at', since).order('decided_at', { ascending: false }).limit(2_000),
    supabase.from('world_event_cluster_sources').select('source_family').gte('created_at', since).not('source_family', 'is', null).limit(5_000),
    supabase.from('world_signals').select('*').order('last_matched_at', { ascending: false, nullsFirst: false }).order('last_observed_at', { ascending: false }).limit(100),
    supabase.from('world_signal_links').select('*').order('created_at', { ascending: false }).limit(100),
    supabase.from('world_specialist_assessments').select('*').order('created_at', { ascending: false }).limit(50),
    supabase.from('world_attention_policy_versions').select('*').order('created_at', { ascending: false }).limit(20),
    supabase.from('world_policy_experiments').select('*').order('created_at', { ascending: false }).limit(20),
    supabase.from('world_review_labels').select('*').eq('owner_id', MARKETS_OWNER_ID).gte('review_week', since.slice(0, 10)).limit(200),
    supabase.from('world_file_index').select('node_id,title,summary,kind,as_of').gte('projected_at', since).order('projected_at', { ascending: false }).limit(50),
    supabase.from('world_coverage_frontiers').select('id,label,status,description,source_family_count').neq('status', 'healthy').limit(20),
  ])
  const decisions = (decisionsResult.data ?? []) as Array<Record<string, unknown>>
  const activeVersion = (policyResult.data ?? []).find((row) => row.status === 'active')?.version
  const activeDecisions = decisions.filter((row) => !activeVersion || row.policy_version === activeVersion)
  const labels = (labelsResult.data ?? []) as Array<Record<string, unknown>>
  const labelFor = (category: WorldReviewCategory, subjectId: string) => labels.find((label) => label.category === category && label.subject_id === subjectId)
  const items: WorldReviewItem[] = []
  const add = (category: WorldReviewCategory, subjectType: WorldReviewItem['subjectType'], rows: Array<Record<string, unknown>>, title: (row: Record<string, unknown>) => string, detail: (row: Record<string, unknown>) => string) => {
    for (const row of rows.slice(0, 5)) {
      const subjectId = String(row.event_cluster_id ?? row.id ?? row.node_id ?? row.source_family ?? 'unknown')
      const label = labelFor(category, subjectId)
      items.push({ category, subjectType, subjectId, title: title(row), detail: detail(row), label: typeof label?.label === 'string' ? label.label : null, notes: typeof label?.notes === 'string' ? label.notes : null })
    }
  }
  add('suspected_miss', 'event', activeDecisions.filter((row) => ['awareness', 'noise', 'company_only'].includes(String(row.route)) && Number((row.dimensions as Record<string, unknown>)?.magnitude ?? 0) >= 50), (row) => `Possible miss · ${String(row.route)}`, (row) => JSON.stringify(row.reasons ?? []))
  add('false_positive', 'event', activeDecisions.filter((row) => ['urgent', 'investigate'].includes(String(row.route))).reverse(), (row) => `Check ${String(row.route)} routing`, (row) => JSON.stringify(row.dimensions ?? {}))
  add('promoted_change', 'node', (promotedResult.data ?? []) as Array<Record<string, unknown>>, (row) => String(row.title), (row) => String(row.summary))
  add('compound_link', 'link', (linkResult.data ?? []) as Array<Record<string, unknown>>, (row) => `${String(row.source_signal_id)} → ${String(row.target_signal_id)}`, (row) => String(row.rationale))
  const coverageRows = (coverageResult.data ?? []) as Array<Record<string, unknown>>
  const sourceConcentration = countBy((sourceResult.data ?? []) as Array<Record<string, unknown>>, 'source_family').filter((item) => item.count > 20).map((item) => ({ id: `source:${item.lane}`, label: item.lane, status: 'concentrated', description: `${item.count} items from one source family this week` }))
  add('coverage_problem', 'source', [...coverageRows, ...sourceConcentration], (row) => String(row.label), (row) => `${String(row.status)} · ${String(row.description)}`)
  for (const category of ['suspected_miss', 'false_positive', 'promoted_change', 'compound_link', 'coverage_problem'] as WorldReviewCategory[]) {
    while (items.filter((item) => item.category === category).length < 5) items.push({ category, subjectType: 'policy', subjectId: `placeholder:${category}:${items.filter((item) => item.category === category).length}`, title: 'No additional candidate this week', detail: 'The slot remains visible so review coverage is explicit.', label: null, notes: null })
  }
  return {
    laneVolumes: countBy(activeDecisions, 'source_lane'), routeVolumes: countBy(activeDecisions, 'route').map(({ lane, count }) => ({ route: lane, count })),
    sourceFamilies: countBy((sourceResult.data ?? []) as Array<Record<string, unknown>>, 'source_family').map(({ lane, count }) => ({ family: lane, count })).slice(0, 20),
    signals: (signalResult.data ?? []) as Array<Record<string, unknown>>, links: (linkResult.data ?? []) as Array<Record<string, unknown>>,
    specialists: (specialistResult.data ?? []) as Array<Record<string, unknown>>, policies: (policyResult.data ?? []) as Array<Record<string, unknown>>,
    experiments: (experimentResult.data ?? []) as Array<Record<string, unknown>>, weeklyReview: items.slice(0, 25),
  }
}

export { WORLD_SOURCE_LANES }

import { fetchAllAuthoritativeHoldings } from './portfolio.ts'
import { enqueueAgentJob } from './agent-jobs.ts'
import {
  evaluateDecisionAlerts,
  eventResearchDedupeKey,
  killCriterionResearchDedupeKey,
  type MaterialEvent,
} from '../markets/monitoring.ts'
import type { ThesisDecision } from '../markets/types.ts'
import { decisionReviewDue } from '../markets/capital-allocation.ts'
import { getSupabaseClient } from './supabase.ts'

interface TrackedName {
  ownerId: string
  portfolioId: string
  symbol: string
  thesisId?: string
  monitorId?: string
  entityKey?: string
}

function topicSymbol(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null
  const topic = (metadata as Record<string, unknown>).topic
  return typeof topic === 'string' && topic.startsWith('company:') ? topic.slice(8).toUpperCase() : null
}

export function isMaterialResearchEvent(category: string, title: string): boolean {
  return /(SEC|10-[KQ]|8-K|filing|earnings|estimate|guidance|press release)/i.test(`${category} ${title}`)
}

export async function scanResearchRefreshes(now = new Date()): Promise<{
  eventAlerts: number
  decisionAlerts: number
  researchJobs: number
  touchedMonitorIds: string[]
}> {
  const supabase = getSupabaseClient()
  if (!supabase) throw new Error('Supabase service credentials are not configured')
  const [
    holdings,
    { data: decisions },
    { data: latestSnapshot },
    { data: acceptedTheses },
    { data: activeMonitors },
    { data: decisionReviews },
  ] = await Promise.all([
    fetchAllAuthoritativeHoldings(),
    supabase.from('thesis_decisions').select('*').order('created_at', { ascending: false }),
    supabase.from('market_snapshots').select('id').eq('status', 'complete').eq('is_latest', true).maybeSingle(),
    supabase.from('investment_theses').select('id,owner_id,symbol,entity_key')
      .eq('entity_type', 'stock').eq('status', 'accepted').not('symbol', 'is', null),
    supabase.from('thesis_monitors').select('id,thesis_id,entity_key').eq('status', 'active'),
    supabase.from('decision_reviews').select('decision_id,reviewed_at').order('reviewed_at', { ascending: false }),
  ])
  const monitorByThesis = new Map((activeMonitors ?? []).map((monitor) => [monitor.thesis_id, monitor]))
  const thesisByOwnerSymbol = new Map<string, Omit<TrackedName, 'portfolioId' | 'symbol'>>()
  for (const thesis of acceptedTheses ?? []) {
    if (!thesis.owner_id || !thesis.symbol) continue
    const monitor = monitorByThesis.get(thesis.id)
    thesisByOwnerSymbol.set(`${thesis.owner_id}:${thesis.symbol}`, {
      ownerId: thesis.owner_id,
      thesisId: thesis.id,
      monitorId: monitor?.id,
      entityKey: thesis.entity_key,
    })
  }
  const tracked = new Map<string, TrackedName>()
  for (const h of holdings) tracked.set(`${h.ownerId}:${h.portfolioId}:${h.symbol}`, {
    ...h, ...thesisByOwnerSymbol.get(`${h.ownerId}:${h.symbol}`),
  })
  if (tracked.size === 0) return { eventAlerts: 0, decisionAlerts: 0, researchJobs: 0, touchedMonitorIds: [] }

  const since = new Date(now.getTime() - 36 * 60 * 60 * 1_000).toISOString()
  const { data: feedRows } = await supabase.from('feed_items').select('id,title,url,published_at,metadata,section')
    .eq('scope', 'markets').gte('published_at', since).order('published_at', { ascending: false }).limit(500)
  let eventAlerts = 0
  let researchJobs = 0
  const touchedMonitorIds = new Set<string>()
  for (const row of feedRows ?? []) {
    const symbol = topicSymbol(row.metadata)
    if (!symbol || !row.url || !row.published_at) continue
    const event: MaterialEvent = {
      id: row.id,
      symbol,
      title: row.title,
      url: row.url,
      category: typeof row.metadata?.category === 'string' ? row.metadata.category : row.section,
      publishedAt: row.published_at,
    }
    if (!isMaterialResearchEvent(event.category, event.title)) continue
    for (const item of tracked.values()) {
      if (item.symbol !== symbol) continue
      const dedupeKey = `event:${item.ownerId}:${item.portfolioId}:${event.id}`
      const { data: insertedAlert, error } = await supabase.from('decision_inbox_items').upsert({
        owner_id: item.ownerId,
        portfolio_id: item.portfolioId,
        item_type: 'catalyst',
        symbol,
        title: event.title,
        summary: `${event.category} may require a thesis refresh.`,
        evidence: [{ label: event.title, url: event.url, asOf: event.publishedAt }],
        investment_thesis_id: item.thesisId ?? null,
        thesis_monitor_id: item.monitorId ?? null,
        entity_key: item.entityKey ?? null,
        severity: 'attention',
        dedupe_key: dedupeKey,
        occurred_at: event.publishedAt,
      }, { onConflict: 'owner_id,dedupe_key', ignoreDuplicates: true }).select('id').maybeSingle()
      if (!error && insertedAlert) {
        eventAlerts += 1
        if (item.monitorId) touchedMonitorIds.add(item.monitorId)
      }
      const jobKey = eventResearchDedupeKey(item.ownerId, event)
      const queued = await enqueueAgentJob('event-refresh-company-research', {
        ownerId: item.ownerId,
        symbol,
        reason: event.category,
        eventId: event.id,
      }, jobKey)
      if (!queued.deduplicated) researchJobs += 1
    }
  }

  let decisionAlerts = 0
  if (decisions) {
    const latestByOwnerSymbol = new Map<string, Record<string, unknown>>()
    for (const row of decisions) {
      const key = `${row.owner_id}:${row.portfolio_id ?? '*'}:${row.symbol}`
      if (!latestByOwnerSymbol.has(key)) latestByOwnerSymbol.set(key, row)
    }
    const latestReviewByDecision = new Map<string, string>()
    for (const review of decisionReviews ?? []) {
      if (!latestReviewByDecision.has(String(review.decision_id))) latestReviewByDecision.set(String(review.decision_id), String(review.reviewed_at))
    }
    for (const trackedName of tracked.values()) {
      const row = latestByOwnerSymbol.get(`${trackedName.ownerId}:${trackedName.portfolioId}:${trackedName.symbol}`)
        ?? latestByOwnerSymbol.get(`${trackedName.ownerId}:*:${trackedName.symbol}`)
      if (!row) continue
      const decision: ThesisDecision = {
        id: row.id as string,
        symbol: trackedName.symbol,
        version: Number(row.version ?? 1),
        disposition: row.disposition as ThesisDecision['disposition'],
        formalRating: row.formal_rating as ThesisDecision['formalRating'],
        entryAction: row.entry_action as ThesisDecision['entryAction'],
        fairValue: row.fair_value === null ? null : Number(row.fair_value),
        entryZoneLow: row.entry_zone_low === null ? null : Number(row.entry_zone_low),
        entryZoneHigh: row.entry_zone_high === null ? null : Number(row.entry_zone_high),
        conviction: row.conviction === null ? null : Number(row.conviction),
        nextCatalyst: row.next_catalyst as string | null,
        killCriteria: Array.isArray(row.kill_criteria) ? row.kill_criteria : [],
        rationale: String(row.rationale ?? ''),
        priceAtDecision: row.price_at_decision === null ? null : Number(row.price_at_decision),
        createdAt: row.created_at as string,
        investmentThesisId: row.investment_thesis_id === null ? null : String(row.investment_thesis_id),
        researchNoteId: row.research_note_id === null ? null : String(row.research_note_id),
        portfolioId: row.portfolio_id === null ? null : String(row.portfolio_id),
        valuationSupport: String(row.valuation_support ?? ''),
        whatChanged: String(row.what_changed ?? ''),
        changeSummary: Array.isArray(row.change_summary) ? row.change_summary.map(String) : [],
        sizingInputs: row.sizing_inputs && typeof row.sizing_inputs === 'object' && !Array.isArray(row.sizing_inputs) ? row.sizing_inputs as ThesisDecision['sizingInputs'] : null,
        constraintStatus: (row.constraint_status ?? 'needs_inputs') as ThesisDecision['constraintStatus'],
      }
      if (decisionReviewDue(decision, latestReviewByDecision.get(decision.id) ?? null, now)) {
        const { data: insertedReviewAlert, error } = await supabase.from('decision_inbox_items').upsert({
          owner_id: trackedName.ownerId,
          portfolio_id: trackedName.portfolioId,
          item_type: 'decision_review_due',
          symbol: trackedName.symbol,
          title: `${trackedName.symbol} capital decision review is due`,
          summary: 'Review the entry setup, thesis-break conditions, realized outcome, and what changed since this decision version.',
          evidence: [],
          investment_thesis_id: trackedName.thesisId ?? null,
          thesis_monitor_id: trackedName.monitorId ?? null,
          entity_key: trackedName.entityKey ?? null,
          severity: 'attention',
          dedupe_key: `decision-review:${decision.id}:${latestReviewByDecision.get(decision.id) ?? "initial"}`,
          occurred_at: now.toISOString(),
        }, { onConflict: 'owner_id,dedupe_key', ignoreDuplicates: true }).select('id').maybeSingle()
        if (!error && insertedReviewAlert) decisionAlerts += 1
      }
      if (!latestSnapshot) continue
      const { data: screener } = await supabase.from('screener_rows').select('price').eq('snapshot_id', latestSnapshot.id)
        .eq('symbol', trackedName.symbol).maybeSingle()
      if (!screener) continue
      for (const alert of evaluateDecisionAlerts(decision, Number(screener.price), now.toISOString())) {
        const dedupeKey = `portfolio:${trackedName.portfolioId}:${alert.dedupeKey}`
        const { data: insertedAlert, error } = await supabase.from('decision_inbox_items').upsert({
          owner_id: trackedName.ownerId,
          portfolio_id: trackedName.portfolioId,
          item_type: alert.type,
          symbol: alert.symbol,
          title: alert.title,
          summary: alert.summary,
          evidence: alert.evidence,
          investment_thesis_id: trackedName.thesisId ?? null,
          thesis_monitor_id: trackedName.monitorId ?? null,
          entity_key: trackedName.entityKey ?? null,
          severity: alert.type === 'kill_criterion_breach' ? 'urgent' : 'attention',
          dedupe_key: dedupeKey,
          occurred_at: alert.occurredAt,
        }, { onConflict: 'owner_id,dedupe_key', ignoreDuplicates: true }).select('id').maybeSingle()
        if (!error && insertedAlert) {
          decisionAlerts += 1
          if (trackedName.monitorId) touchedMonitorIds.add(trackedName.monitorId)
        }
        if (alert.type === 'kill_criterion_breach') {
          const refresh = await enqueueAgentJob('event-refresh-company-research', {
            ownerId: trackedName.ownerId,
            symbol: alert.symbol,
            reason: 'kill-criterion-breach',
            eventId: alert.dedupeKey,
          }, killCriterionResearchDedupeKey(trackedName.ownerId, alert.dedupeKey))
          if (!refresh.deduplicated) researchJobs += 1
        }
      }
    }
  }
  return { eventAlerts, decisionAlerts, researchJobs, touchedMonitorIds: [...touchedMonitorIds] }
}

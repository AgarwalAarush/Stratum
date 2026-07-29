import { enqueueAgentJob } from './agent-jobs.ts'
import {
  evaluateDecisionAlerts,
  eventResearchDedupeKey,
  killCriterionResearchDedupeKey,
  type MaterialEvent,
} from '../markets/monitoring.ts'
import type { ThesisDecision } from '../markets/types.ts'
import { getSupabaseClient } from './supabase.ts'

interface TrackedName {
  ownerId: string
  symbol: string
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
}> {
  const supabase = getSupabaseClient()
  if (!supabase) throw new Error('Supabase service credentials are not configured')
  const [{ data: listItems }, { data: positions }, { data: decisions }, { data: latestSnapshot }] = await Promise.all([
    supabase.from('market_watchlist_items').select('symbol,market_watchlists!inner(owner_id)').not('market_watchlists.owner_id', 'is', null),
    supabase.from('manual_positions').select('owner_id,symbol'),
    supabase.from('thesis_decisions').select('*').order('created_at', { ascending: false }),
    supabase.from('market_snapshots').select('id').eq('status', 'complete').eq('is_latest', true).maybeSingle(),
  ])
  const tracked = new Map<string, TrackedName>()
  for (const row of listItems ?? []) {
    const relation = Array.isArray(row.market_watchlists) ? row.market_watchlists[0] : row.market_watchlists
    if (relation?.owner_id) tracked.set(`${relation.owner_id}:${row.symbol}`, { ownerId: relation.owner_id, symbol: row.symbol })
  }
  for (const row of positions ?? []) tracked.set(`${row.owner_id}:${row.symbol}`, { ownerId: row.owner_id, symbol: row.symbol })
  if (tracked.size === 0) return { eventAlerts: 0, decisionAlerts: 0, researchJobs: 0 }

  const since = new Date(now.getTime() - 36 * 60 * 60 * 1_000).toISOString()
  const { data: feedRows } = await supabase.from('feed_items').select('id,title,url,published_at,metadata,section')
    .eq('scope', 'markets').gte('published_at', since).order('published_at', { ascending: false }).limit(500)
  let eventAlerts = 0
  let researchJobs = 0
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
      const dedupeKey = `event:${item.ownerId}:${event.id}`
      const { data: insertedAlert, error } = await supabase.from('decision_inbox_items').upsert({
        owner_id: item.ownerId,
        item_type: 'catalyst',
        symbol,
        title: event.title,
        summary: `${event.category} may require a thesis refresh.`,
        evidence: [{ label: event.title, url: event.url, asOf: event.publishedAt }],
        dedupe_key: dedupeKey,
        occurred_at: event.publishedAt,
      }, { onConflict: 'owner_id,dedupe_key', ignoreDuplicates: true }).select('id').maybeSingle()
      if (!error && insertedAlert) eventAlerts += 1
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
  if (latestSnapshot && decisions) {
    const latestByOwnerSymbol = new Map<string, Record<string, unknown>>()
    for (const row of decisions) {
      const key = `${row.owner_id}:${row.symbol}`
      if (!latestByOwnerSymbol.has(key)) latestByOwnerSymbol.set(key, row)
    }
    for (const [key, row] of latestByOwnerSymbol) {
      if (!tracked.has(key)) continue
      const { data: screener } = await supabase.from('screener_rows').select('price').eq('snapshot_id', latestSnapshot.id)
        .eq('symbol', row.symbol).maybeSingle()
      if (!screener) continue
      const decision: ThesisDecision = {
        id: row.id as string,
        symbol: row.symbol as string,
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
        createdAt: row.created_at as string,
      }
      for (const alert of evaluateDecisionAlerts(decision, Number(screener.price), now.toISOString())) {
        const { data: insertedAlert, error } = await supabase.from('decision_inbox_items').upsert({
          owner_id: row.owner_id,
          item_type: alert.type,
          symbol: alert.symbol,
          title: alert.title,
          summary: alert.summary,
          evidence: alert.evidence,
          dedupe_key: alert.dedupeKey,
          occurred_at: alert.occurredAt,
        }, { onConflict: 'owner_id,dedupe_key', ignoreDuplicates: true }).select('id').maybeSingle()
        if (!error && insertedAlert) decisionAlerts += 1
        if (alert.type === 'kill_criterion_breach') {
          const refresh = await enqueueAgentJob('event-refresh-company-research', {
            ownerId: row.owner_id,
            symbol: alert.symbol,
            reason: 'kill-criterion-breach',
            eventId: alert.dedupeKey,
          }, killCriterionResearchDedupeKey(String(row.owner_id), alert.dedupeKey))
          if (!refresh.deduplicated) researchJobs += 1
        }
      }
    }
  }
  return { eventAlerts, decisionAlerts, researchJobs }
}

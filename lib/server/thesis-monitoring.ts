import {
  evaluateIndustryThesisSignals,
  type IndustryMonitorState,
} from '../markets/thesis-monitoring.ts'
import { scanResearchRefreshes } from './research-monitoring.ts'
import { getSupabaseClient } from './supabase.ts'

interface AcceptedThesisRow {
  id: string
  owner_id: string
  entity_type: 'stock' | 'sub_industry'
  entity_key: string
  symbol: string | null
  sector: string | null
  sub_industry: string | null
}

interface MonitorRow {
  id: string
  owner_id: string
  thesis_id: string
  entity_key: string
  status: 'active' | 'paused'
  last_state: unknown
  failure_count: number
}

interface GroupMetricRow {
  label: string
  sector: string
  return_30d: number | string | null
  return_1y: number | string | null
  vs_50_day_average: number | string | null
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function numberOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function previousIndustryState(value: unknown): IndustryMonitorState | null {
  const state = record(value)
  if (typeof state.snapshotId !== 'string' || typeof state.dataAsOf !== 'string') return null
  return {
    snapshotId: state.snapshotId,
    dataAsOf: state.dataAsOf,
    return30d: numberOrNull(state.return30d),
    return1y: numberOrNull(state.return1y),
    vs50DayAverage: numberOrNull(state.vs50DayAverage),
    rank30d: numberOrNull(state.rank30d),
  }
}

function coverage(entityType: AcceptedThesisRow['entity_type']): string[] {
  return entityType === 'stock'
    ? ['price', 'material_events', 'research']
    : ['leadership', 'candidate_scout']
}

async function syncAcceptedThesisMonitors(theses: AcceptedThesisRow[]): Promise<number> {
  if (theses.length === 0) return 0
  const supabase = getSupabaseClient()!
  const { error } = await supabase.from('thesis_monitors').upsert(theses.map((thesis) => ({
    owner_id: thesis.owner_id,
    thesis_id: thesis.id,
    entity_key: thesis.entity_key,
    status: 'active',
    coverage: coverage(thesis.entity_type),
    updated_at: new Date().toISOString(),
  })), { onConflict: 'owner_id,entity_key', ignoreDuplicates: true })
  if (error) throw new Error(`Unable to synchronize accepted thesis monitors: ${error.message}`)
  return theses.length
}

export async function monitorInvestmentTheses(now = new Date()): Promise<{
  activeMonitors: number
  stockMonitors: number
  industryMonitors: number
  alerts: number
  researchJobs: number
}> {
  const supabase = getSupabaseClient()
  if (!supabase) throw new Error('Supabase service credentials are not configured')
  const { data: acceptedRows, error: thesisError } = await supabase.from('investment_theses')
    .select('id,owner_id,entity_type,entity_key,symbol,sector,sub_industry')
    .eq('status', 'accepted')
  if (thesisError) throw new Error(`Unable to load accepted theses: ${thesisError.message}`)
  const accepted = (acceptedRows ?? []) as AcceptedThesisRow[]
  await syncAcceptedThesisMonitors(accepted)

  const { data: monitorRows, error: monitorError } = await supabase.from('thesis_monitors')
    .select('id,owner_id,thesis_id,entity_key,status,last_state,failure_count').eq('status', 'active')
  if (monitorError) throw new Error(`Unable to load thesis monitors: ${monitorError.message}`)
  const monitors = (monitorRows ?? []) as MonitorRow[]
  if (monitors.length === 0) {
    return { activeMonitors: 0, stockMonitors: 0, industryMonitors: 0, alerts: 0, researchJobs: 0 }
  }

  const thesisById = new Map(accepted.map((thesis) => [thesis.id, thesis]))
  const research = await scanResearchRefreshes(now)
  const touched = new Set(research.touchedMonitorIds)
  const stockMonitors = monitors.filter((monitor) => thesisById.get(monitor.thesis_id)?.entity_type === 'stock')
  const industryMonitors = monitors.filter((monitor) => thesisById.get(monitor.thesis_id)?.entity_type === 'sub_industry')
  const checkedAt = now.toISOString()

  let latestSnapshot: { id: string; data_as_of: string } | null = null
  let latestLeadership: { id: string; data_as_of: string } | null = null
  let groupMetrics: GroupMetricRow[] = []
  const [{ data: marketSnapshot }, { data: leadershipSnapshot }] = await Promise.all([
    supabase.from('market_snapshots').select('id,data_as_of').eq('status', 'complete').eq('is_latest', true).maybeSingle(),
    supabase.from('market_leadership_snapshots').select('id,data_as_of').eq('status', 'complete').eq('is_latest', true).maybeSingle(),
  ])
  latestSnapshot = marketSnapshot
  latestLeadership = leadershipSnapshot
  if (latestLeadership) {
    const { data, error } = await supabase.from('market_group_metrics')
      .select('label,sector,return_30d,return_1y,vs_50_day_average')
      .eq('snapshot_id', latestLeadership.id).eq('group_type', 'sub_industry')
    if (error) throw new Error(`Unable to load current industry metrics: ${error.message}`)
    groupMetrics = (data ?? []) as GroupMetricRow[]
  }

  const pricesBySymbol = new Map<string, number>()
  const symbols = stockMonitors.flatMap((monitor) => {
    const symbol = thesisById.get(monitor.thesis_id)?.symbol
    return symbol ? [symbol] : []
  })
  if (latestSnapshot && symbols.length > 0) {
    const { data, error } = await supabase.from('screener_rows').select('symbol,price')
      .eq('snapshot_id', latestSnapshot.id).in('symbol', symbols)
    if (error) throw new Error(`Unable to load monitored stock prices: ${error.message}`)
    for (const row of data ?? []) pricesBySymbol.set(row.symbol, Number(row.price))
  }

  await Promise.all(stockMonitors.map(async (monitor) => {
    const thesis = thesisById.get(monitor.thesis_id)!
    const lastState = {
      snapshotId: latestSnapshot?.id ?? null,
      dataAsOf: latestSnapshot?.data_as_of ?? checkedAt,
      price: thesis.symbol ? pricesBySymbol.get(thesis.symbol) ?? null : null,
    }
    const { error } = await supabase.from('thesis_monitors').update({
      last_state: lastState,
      last_checked_at: checkedAt,
      last_evidence_at: touched.has(monitor.id) ? checkedAt : undefined,
      last_outcome: touched.has(monitor.id) ? 'attention' : 'no_change',
      failure_count: 0,
      last_error: null,
      updated_at: checkedAt,
    }).eq('id', monitor.id)
    if (error) throw new Error(`Unable to update stock thesis monitor: ${error.message}`)
  }))

  let industryAlerts = 0
  for (const monitor of industryMonitors) {
    const thesis = thesisById.get(monitor.thesis_id)!
    if (!latestLeadership || !thesis.sub_industry) continue
    try {
      const ranked = [...groupMetrics]
        .filter((metric) => numberOrNull(metric.return_30d) !== null)
        .sort((left, right) => numberOrNull(right.return_30d)! - numberOrNull(left.return_30d)!)
      const metric = groupMetrics.find((item) =>
        item.label === thesis.sub_industry && (!thesis.sector || item.sector === thesis.sector))
      if (!metric) continue
      const rankIndex = ranked.findIndex((item) =>
        item.label === thesis.sub_industry && (!thesis.sector || item.sector === thesis.sector))
      const current: IndustryMonitorState = {
        snapshotId: latestLeadership.id,
        dataAsOf: latestLeadership.data_as_of,
        return30d: numberOrNull(metric.return_30d),
        return1y: numberOrNull(metric.return_1y),
        vs50DayAverage: numberOrNull(metric.vs_50_day_average),
        rank30d: rankIndex < 0 ? null : rankIndex + 1,
      }
      const signals = evaluateIndustryThesisSignals(previousIndustryState(monitor.last_state), current)
      if (signals.length > 0) {
        const severity = signals.some((signal) => signal.severity === 'urgent') ? 'urgent' : 'attention'
        const evidence = [{
          label: `${thesis.sub_industry} market leadership`,
          url: '/markets',
          asOf: latestLeadership.data_as_of,
        }]
        const fingerprint = `${latestLeadership.id}:${signals.map((signal) => signal.reasonCode).sort().join(',')}`
        const { error: runError } = await supabase.from('thesis_monitor_runs').upsert({
          monitor_id: monitor.id,
          thesis_id: thesis.id,
          owner_id: thesis.owner_id,
          data_fingerprint: fingerprint,
          outcome: 'attention',
          reason_codes: signals.map((signal) => signal.reasonCode),
          findings: signals,
          evidence,
          evaluated_at: checkedAt,
        }, { onConflict: 'monitor_id,data_fingerprint', ignoreDuplicates: true })
        if (runError) throw new Error(runError.message)
        const { data: alert, error: alertError } = await supabase.from('decision_inbox_items').upsert({
          owner_id: thesis.owner_id,
          item_type: 'thesis_refresh',
          symbol: null,
          title: `${thesis.sub_industry} thesis requires attention`,
          summary: signals.map((signal) => signal.summary).join(' '),
          evidence,
          investment_thesis_id: thesis.id,
          thesis_monitor_id: monitor.id,
          entity_key: thesis.entity_key,
          severity,
          dedupe_key: `thesis-monitor:${monitor.id}:${fingerprint}`,
          occurred_at: latestLeadership.data_as_of,
        }, { onConflict: 'owner_id,dedupe_key', ignoreDuplicates: true }).select('id').maybeSingle()
        if (alertError) throw new Error(alertError.message)
        if (alert) industryAlerts += 1
      }
      const { error: updateError } = await supabase.from('thesis_monitors').update({
        last_state: current,
        last_checked_at: checkedAt,
        last_evidence_at: signals.length > 0 ? latestLeadership.data_as_of : undefined,
        last_outcome: signals.length > 0 ? 'attention' : 'no_change',
        failure_count: 0,
        last_error: null,
        updated_at: checkedAt,
      }).eq('id', monitor.id)
      if (updateError) throw new Error(updateError.message)
    } catch (error) {
      await supabase.from('thesis_monitors').update({
        last_checked_at: checkedAt,
        last_outcome: 'failed',
        failure_count: Number(monitor.failure_count ?? 0) + 1,
        last_error: error instanceof Error ? error.message : String(error),
        updated_at: checkedAt,
      }).eq('id', monitor.id)
    }
  }

  return {
    activeMonitors: monitors.length,
    stockMonitors: stockMonitors.length,
    industryMonitors: industryMonitors.length,
    alerts: research.eventAlerts + research.decisionAlerts + industryAlerts,
    researchJobs: research.researchJobs,
  }
}

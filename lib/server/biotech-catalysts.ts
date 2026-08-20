import { canonicalWorldSourceFamily, classifyWorldSourceLane } from '../markets/world-attention.ts'
import { normalizeClinicalCatalyst, type ClinicalCatalyst, type ClinicalCatalystSource } from '../markets/biotech.ts'
import { getSupabaseClient } from './supabase.ts'

export interface BiotechCatalystSourceView {
  sourceId: string
  title: string
  url: string
  publisher: string
  publishedAt: string | null
  fetchedAt: string
  sourceLane: string
  sourceFamily: string
  sourceTimeAnomaly: boolean
}

export interface BiotechCatalystView extends ClinicalCatalyst {
  eventClusterIds: string[]
  sourceIds: string[]
  status: 'observed' | 'investigating' | 'researched' | 'dismissed' | 'superseded'
  nextReviewAt: string
  sources: BiotechCatalystSourceView[]
}

export interface BiotechMover {
  symbol: string
  company: string
  price: number
  dailyChange: number
  gap: number
  relativeVolume: number
  dataAsOf: string
  candidateId: string | null
  candidateStatus: string | null
  linkedCatalystCount: number
}

export interface BiotechWorkspace {
  catalysts: BiotechCatalystView[]
  movers: BiotechMover[]
  dataAsOf: string | null
  sourceFamilyCount: number
  urgentCount: number
  investigationCount: number
  timeAnomalyCount: number
}

export async function findExtraordinaryBiotechMovers(snapshotId: string, threshold = 15): Promise<string[]> {
  const supabase = getSupabaseClient()
  if (!supabase) return []
  const { data, error } = await supabase.from('screener_rows')
    .select('symbol,daily_change,gap,sector,sub_industry')
    .eq('snapshot_id', snapshotId)
    .or('sector.eq.Health Care,sub_industry.ilike.%biotech%,sub_industry.ilike.%pharma%')
  if (error) throw new Error(`Unable to inspect biotech market moves: ${error.message}`)
  return (data ?? [])
    .filter((row) => Math.max(Math.abs(Number(row.daily_change)), Math.abs(Number(row.gap))) >= threshold)
    .sort((left, right) => Math.max(Math.abs(Number(right.daily_change)), Math.abs(Number(right.gap))) - Math.max(Math.abs(Number(left.daily_change)), Math.abs(Number(left.gap))))
    .map((row) => String(row.symbol))
    .slice(0, 12)
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

function nextReviewAt(catalyst: ClinicalCatalyst): string {
  const days = catalyst.significance === 'urgent' ? 2 : catalyst.significance === 'investigate' ? 7 : 30
  return new Date(Date.parse(catalyst.publishedAt ?? catalyst.fetchedAt) + days * 86_400_000).toISOString()
}

function sourceTimeAnomaly(source: ClinicalCatalystSource): boolean {
  if (source.metadata?.publishedAtAnomaly === 'publication_after_ingestion') return true
  if (!source.publishedAt) return false
  return Date.parse(source.publishedAt) > Date.parse(source.fetchedAt) + 5 * 60_000
}

export async function persistBiotechCatalystSources(sources: ClinicalCatalystSource[]): Promise<{ detected: number; persisted: number }> {
  const supabase = getSupabaseClient()
  if (!supabase) return { detected: 0, persisted: 0 }
  const catalysts = sources.map(normalizeClinicalCatalyst).filter((item): item is ClinicalCatalyst => Boolean(item))
  let persisted = 0
  for (const catalyst of catalysts) {
    const { data: existing, error: existingError } = await supabase.from('biotech_clinical_catalysts')
      .select('source_ids,first_observed_at,last_observed_at')
      .eq('fingerprint', catalyst.fingerprint)
      .maybeSingle()
    if (existingError) throw new Error(`Unable to read clinical catalyst ${catalyst.fingerprint}: ${existingError.message}`)
    const sourceIds = [...new Set([...strings(existing?.source_ids), catalyst.sourceId])]
    const observedAt = catalyst.publishedAt ?? catalyst.fetchedAt
    const { error } = await supabase.from('biotech_clinical_catalysts').upsert({
      fingerprint: catalyst.fingerprint,
      title: catalyst.title,
      kind: catalyst.kind,
      outcome: catalyst.outcome,
      significance: catalyst.significance,
      phase: catalyst.phase,
      trial_id: catalyst.trialId,
      therapy: catalyst.therapy,
      indication: catalyst.indication,
      symbols: catalyst.symbols,
      materiality: catalyst.materiality,
      time_sensitivity: catalyst.timeSensitivity,
      economic_channels: catalyst.economicChannels,
      decisive_new_event: catalyst.decisiveNewEvent,
      source_ids: sourceIds,
      first_observed_at: existing?.first_observed_at && Date.parse(existing.first_observed_at) < Date.parse(observedAt) ? existing.first_observed_at : observedAt,
      last_observed_at: existing?.last_observed_at && Date.parse(existing.last_observed_at) > Date.parse(observedAt) ? existing.last_observed_at : observedAt,
      next_review_at: nextReviewAt(catalyst),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'fingerprint' })
    if (error) throw new Error(`Unable to persist clinical catalyst ${catalyst.fingerprint}: ${error.message}`)
    const lane = classifyWorldSourceLane(catalyst)
    const family = canonicalWorldSourceFamily({ url: catalyst.url, publisher: catalyst.publisher, metadata: sourceIdMetadata(sourceById(sources, catalyst.sourceId)?.metadata) })
    const source = sourceById(sources, catalyst.sourceId)!
    const { error: sourceError } = await supabase.from('biotech_clinical_catalyst_sources').upsert({
      catalyst_fingerprint: catalyst.fingerprint,
      source_id: catalyst.sourceId,
      feed_item_id: catalyst.feedItemId,
      document_id: catalyst.documentId,
      title: catalyst.title,
      url: catalyst.url,
      publisher: catalyst.publisher,
      published_at: catalyst.publishedAt,
      fetched_at: catalyst.fetchedAt,
      source_lane: lane,
      source_family: family,
      source_time_anomaly: sourceTimeAnomaly(source),
    }, { onConflict: 'catalyst_fingerprint,source_id' })
    if (sourceError) throw new Error(`Unable to persist clinical catalyst source ${catalyst.sourceId}: ${sourceError.message}`)
    persisted += 1
  }
  return { detected: catalysts.length, persisted }
}

function sourceById(sources: ClinicalCatalystSource[], id: string): ClinicalCatalystSource | undefined {
  return sources.find((source) => source.id === id)
}

function sourceIdMetadata(value: Record<string, unknown> | undefined): Record<string, unknown> {
  return value ?? {}
}

export async function linkBiotechCatalystsToEvent(eventClusterId: string, sourceIds: string[]): Promise<void> {
  const supabase = getSupabaseClient()
  if (!supabase || sourceIds.length === 0) return
  const { data, error } = await supabase.from('biotech_clinical_catalyst_sources')
    .select('catalyst_fingerprint')
    .in('source_id', sourceIds)
  if (error) throw new Error(`Unable to resolve clinical catalyst event lineage: ${error.message}`)
  for (const fingerprint of [...new Set((data ?? []).map((row) => String(row.catalyst_fingerprint)))]) {
    const { data: existing, error: readError } = await supabase.from('biotech_clinical_catalysts')
      .select('event_cluster_ids')
      .eq('fingerprint', fingerprint)
      .single()
    if (readError) throw new Error(`Unable to read clinical catalyst event lineage: ${readError.message}`)
    const eventClusterIds = [...new Set([...strings(existing.event_cluster_ids), eventClusterId])]
    const { error: updateError } = await supabase.from('biotech_clinical_catalysts')
      .update({ event_cluster_ids: eventClusterIds, updated_at: new Date().toISOString() })
      .eq('fingerprint', fingerprint)
    if (updateError) throw new Error(`Unable to link clinical catalyst to World event: ${updateError.message}`)
  }
}

function catalystView(row: Record<string, unknown>, sources: BiotechCatalystSourceView[]): BiotechCatalystView {
  return {
    fingerprint: String(row.fingerprint),
    title: String(row.title),
    url: sources[0]?.url ?? '',
    publisher: sources[0]?.publisher ?? 'Unknown source',
    sourceId: sources[0]?.sourceId ?? strings(row.source_ids)[0] ?? '',
    feedItemId: null,
    documentId: null,
    publishedAt: sources[0]?.publishedAt ?? null,
    fetchedAt: sources[0]?.fetchedAt ?? String(row.last_observed_at),
    kind: row.kind as BiotechCatalystView['kind'],
    outcome: row.outcome as BiotechCatalystView['outcome'],
    significance: row.significance as BiotechCatalystView['significance'],
    phase: typeof row.phase === 'string' ? row.phase : null,
    trialId: typeof row.trial_id === 'string' ? row.trial_id : null,
    therapy: typeof row.therapy === 'string' ? row.therapy : null,
    indication: typeof row.indication === 'string' ? row.indication : null,
    symbols: strings(row.symbols),
    materiality: Number(row.materiality),
    timeSensitivity: Number(row.time_sensitivity),
    economicChannels: strings(row.economic_channels),
    decisiveNewEvent: Boolean(row.decisive_new_event),
    summary: [row.phase, row.therapy, row.indication, row.outcome].filter(Boolean).join(' · '),
    eventClusterIds: strings(row.event_cluster_ids),
    sourceIds: strings(row.source_ids),
    status: row.status as BiotechCatalystView['status'],
    nextReviewAt: String(row.next_review_at),
    sources,
  }
}

export async function fetchBiotechWorkspace(limit = 80): Promise<BiotechWorkspace> {
  const supabase = getSupabaseClient()
  if (!supabase) return { catalysts: [], movers: [], dataAsOf: null, sourceFamilyCount: 0, urgentCount: 0, investigationCount: 0, timeAnomalyCount: 0 }
  const since = new Date(Date.now() - 90 * 86_400_000).toISOString()
  const [{ data: catalystRows, error: catalystError }, { data: snapshot, error: snapshotError }] = await Promise.all([
    supabase.from('biotech_clinical_catalysts').select('*').gte('last_observed_at', since).order('last_observed_at', { ascending: false }).limit(limit),
    supabase.from('market_snapshots').select('id,data_as_of').eq('is_latest', true).eq('status', 'complete').maybeSingle(),
  ])
  if (catalystError) throw new Error(`Unable to load biotech catalysts: ${catalystError.message}`)
  if (snapshotError) throw new Error(`Unable to load biotech market snapshot: ${snapshotError.message}`)
  const fingerprints = (catalystRows ?? []).map((row) => String(row.fingerprint))
  const [{ data: sourceRows, error: sourceError }, moverResult] = await Promise.all([
    fingerprints.length
      ? supabase.from('biotech_clinical_catalyst_sources').select('*').in('catalyst_fingerprint', fingerprints).order('published_at', { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    snapshot?.id
      ? supabase.from('screener_rows').select('symbol,company,price,daily_change,gap,relative_volume,data_as_of,sector,sub_industry').eq('snapshot_id', snapshot.id).or('sector.eq.Health Care,sub_industry.ilike.%biotech%,sub_industry.ilike.%pharma%').order('daily_change', { ascending: false }).limit(40)
      : Promise.resolve({ data: [], error: null }),
  ])
  if (sourceError) throw new Error(`Unable to load biotech catalyst sources: ${sourceError.message}`)
  if (moverResult.error) throw new Error(`Unable to load biotech movers: ${moverResult.error.message}`)
  const sourceViews = (sourceRows ?? []).map((row) => ({
    catalystFingerprint: String(row.catalyst_fingerprint),
    sourceId: String(row.source_id), title: String(row.title), url: String(row.url), publisher: String(row.publisher),
    publishedAt: typeof row.published_at === 'string' ? row.published_at : null, fetchedAt: String(row.fetched_at),
    sourceLane: String(row.source_lane), sourceFamily: String(row.source_family), sourceTimeAnomaly: Boolean(row.source_time_anomaly),
  }))
  const catalysts = (catalystRows ?? []).map((row) => catalystView(row, sourceViews.filter((source) => source.catalystFingerprint === row.fingerprint)))
  const symbols = [...new Set((moverResult.data ?? []).map((row) => String(row.symbol)))]
  const { data: candidates, error: candidateError } = symbols.length
    ? await supabase.from('candidate_briefs').select('id,symbol,status').in('symbol', symbols).order('generated_at', { ascending: false }).limit(200)
    : { data: [], error: null }
  if (candidateError) throw new Error(`Unable to load biotech candidate linkage: ${candidateError.message}`)
  const latestCandidateBySymbol = new Map<string, { id: string; status: string }>()
  for (const candidate of candidates ?? []) if (!latestCandidateBySymbol.has(String(candidate.symbol))) latestCandidateBySymbol.set(String(candidate.symbol), { id: String(candidate.id), status: String(candidate.status) })
  const movers = (moverResult.data ?? [])
    .filter((row) => Math.abs(Number(row.daily_change)) >= 5 || Math.abs(Number(row.gap)) >= 5)
    .map((row) => {
      const symbol = String(row.symbol)
      const candidate = latestCandidateBySymbol.get(symbol)
      return {
        symbol, company: String(row.company), price: Number(row.price), dailyChange: Number(row.daily_change), gap: Number(row.gap),
        relativeVolume: Number(row.relative_volume), dataAsOf: String(row.data_as_of), candidateId: candidate?.id ?? null,
        candidateStatus: candidate?.status ?? null, linkedCatalystCount: catalysts.filter((catalyst) => catalyst.symbols.includes(symbol)).length,
      }
    })
  return {
    catalysts,
    movers,
    dataAsOf: snapshot?.data_as_of ?? catalysts[0]?.fetchedAt ?? null,
    sourceFamilyCount: new Set(sourceViews.map((source) => source.sourceFamily)).size,
    urgentCount: catalysts.filter((catalyst) => catalyst.significance === 'urgent').length,
    investigationCount: catalysts.filter((catalyst) => catalyst.significance === 'investigate').length,
    timeAnomalyCount: sourceViews.filter((source) => source.sourceTimeAnomaly).length,
  }
}

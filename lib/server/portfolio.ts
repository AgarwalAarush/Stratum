import {
  createDefaultWatchlistState,
  parseWatchlistState,
  type MarketWatchlistState,
} from '../markets/watchlists.ts'
import type {
  DecisionReview,
  DecisionInboxItem,
  ManualPosition,
  PortfolioWorkspaceData,
  ThesisDecision,
  ThesisKillCriterion,
} from '../markets/types.ts'
import { getSupabaseClient } from './supabase.ts'

function validOwnerId(ownerId: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(ownerId)
}

function numberOrNull(value: unknown): number | null {
  return value === null || value === undefined ? null : Number(value)
}

function normalizeDecision(row: Record<string, unknown>): ThesisDecision {
  return {
    id: String(row.id),
    symbol: String(row.symbol),
    version: Number(row.version ?? 1),
    disposition: row.disposition as ThesisDecision['disposition'],
    formalRating: row.formal_rating as ThesisDecision['formalRating'],
    entryAction: row.entry_action as ThesisDecision['entryAction'],
    fairValue: numberOrNull(row.fair_value),
    entryZoneLow: numberOrNull(row.entry_zone_low),
    entryZoneHigh: numberOrNull(row.entry_zone_high),
    conviction: numberOrNull(row.conviction),
    nextCatalyst: row.next_catalyst === null ? null : String(row.next_catalyst),
    killCriteria: Array.isArray(row.kill_criteria) ? row.kill_criteria as ThesisKillCriterion[] : [],
    rationale: String(row.rationale ?? ''),
    priceAtDecision: numberOrNull(row.price_at_decision),
    createdAt: String(row.created_at),
  }
}

function normalizeReview(row: Record<string, unknown>): DecisionReview {
  return {
    id: String(row.id),
    decisionId: String(row.decision_id),
    symbol: String(row.symbol),
    outcome: row.outcome as DecisionReview['outcome'],
    expectationAssessment: String(row.expectation_assessment ?? ''),
    lessons: String(row.lessons ?? ''),
    postmortem: String(row.postmortem ?? ''),
    reviewedAt: String(row.reviewed_at),
  }
}

function normalizePosition(row: Record<string, unknown>): ManualPosition {
  return {
    id: String(row.id),
    symbol: String(row.symbol),
    shares: Number(row.shares),
    costBasisPerShare: Number(row.cost_basis_per_share),
    openedAt: row.opened_at === null ? null : String(row.opened_at),
    notes: String(row.notes ?? ''),
    updatedAt: String(row.updated_at),
  }
}

function normalizeInbox(row: Record<string, unknown>): DecisionInboxItem {
  return {
    id: String(row.id),
    type: row.item_type as DecisionInboxItem['type'],
    symbol: String(row.symbol),
    title: String(row.title),
    summary: String(row.summary),
    evidence: Array.isArray(row.evidence) ? row.evidence as DecisionInboxItem['evidence'] : [],
    status: row.status as DecisionInboxItem['status'],
    dedupeKey: String(row.dedupe_key),
    occurredAt: String(row.occurred_at),
    createdAt: String(row.created_at),
  }
}

export async function fetchPortfolioWorkspace(
  ownerId: string,
  availableSymbols: string[] = [],
): Promise<PortfolioWorkspaceData> {
  const fallback = createDefaultWatchlistState(availableSymbols)
  const supabase = getSupabaseClient()
  if (!supabase || !validOwnerId(ownerId)) {
    return {
      watchlists: fallback,
      watchlistsPersisted: false,
      positions: [],
      decisions: [],
      decisionHistory: [],
      reviews: [],
      inbox: [],
    }
  }
  const [
    { data: listRows },
    { data: positionRows },
    { data: decisionRows },
    { data: reviewRows },
    { data: inboxRows },
  ] = await Promise.all([
    supabase.from('market_watchlists').select('id,client_id,name,market_watchlist_items(symbol)').eq('owner_id', ownerId).order('created_at'),
    supabase.from('manual_positions').select('*').eq('owner_id', ownerId).order('updated_at', { ascending: false }),
    supabase.from('thesis_decisions').select('*').eq('owner_id', ownerId).order('created_at', { ascending: false }),
    supabase.from('decision_reviews').select('*').eq('owner_id', ownerId).order('reviewed_at', { ascending: false }),
    supabase.from('decision_inbox_items').select('*').eq('owner_id', ownerId).eq('status', 'open').order('occurred_at', { ascending: false }),
  ])
  const lists = (listRows ?? []).map((row) => ({
    id: row.client_id ?? row.id,
    name: row.name,
    symbols: (row.market_watchlist_items ?? []).map((item: { symbol: string }) => item.symbol),
  }))
  const watchlists: MarketWatchlistState = lists.length === 0
    ? fallback
    : { version: 1, activeListId: lists[0]!.id, lists }
  const decisionHistory = (decisionRows ?? []).map((row) => normalizeDecision(row))
  const latestDecisionBySymbol = new Map<string, ThesisDecision>()
  for (const decision of decisionHistory) {
    if (!latestDecisionBySymbol.has(decision.symbol)) latestDecisionBySymbol.set(decision.symbol, decision)
  }
  return {
    watchlists,
    watchlistsPersisted: lists.length > 0,
    positions: (positionRows ?? []).map((row) => normalizePosition(row)),
    decisions: [...latestDecisionBySymbol.values()],
    decisionHistory,
    reviews: (reviewRows ?? []).map((row) => normalizeReview(row)),
    inbox: (inboxRows ?? []).map((row) => normalizeInbox(row)),
  }
}

export async function replaceUserWatchlists(ownerId: string, input: unknown): Promise<MarketWatchlistState> {
  if (!validOwnerId(ownerId)) throw new Error('A persisted authenticated user is required')
  const supabase = getSupabaseClient()
  if (!supabase) throw new Error('Supabase service credentials are not configured')
  const state = parseWatchlistState(input, createDefaultWatchlistState([]))
  const retainedIds: string[] = []
  for (const list of state.lists) {
    const { data: existingList, error: lookupError } = await supabase
      .from('market_watchlists')
      .select('id')
      .eq('owner_id', ownerId)
      .eq('client_id', list.id)
      .maybeSingle()
    if (lookupError) throw new Error(`Unable to find watchlist ${list.name}: ${lookupError.message}`)
    const mutation = existingList
      ? supabase.from('market_watchlists').update({
          name: list.name,
          updated_at: new Date().toISOString(),
        }).eq('id', existingList.id).eq('owner_id', ownerId)
      : supabase.from('market_watchlists').insert({
          owner_id: ownerId,
          client_id: list.id,
          name: list.name,
          updated_at: new Date().toISOString(),
        })
    const { data: stored, error } = await mutation.select('id').single()
    if (error || !stored) throw new Error(`Unable to persist watchlist ${list.name}: ${error?.message ?? 'unknown error'}`)
    retainedIds.push(stored.id)
    const { error: deleteError } = await supabase.from('market_watchlist_items').delete().eq('watchlist_id', stored.id)
    if (deleteError) throw new Error(`Unable to replace watchlist items: ${deleteError.message}`)
    if (list.symbols.length > 0) {
      const { error: insertError } = await supabase.from('market_watchlist_items').insert(
        list.symbols.map((symbol) => ({ watchlist_id: stored.id, symbol })),
      )
      if (insertError) throw new Error(`Unable to persist watchlist items: ${insertError.message}`)
    }
  }
  const { data: existing } = await supabase.from('market_watchlists').select('id').eq('owner_id', ownerId)
  const removed = (existing ?? []).map((row) => row.id).filter((id) => !retainedIds.includes(id))
  if (removed.length > 0) await supabase.from('market_watchlists').delete().in('id', removed).eq('owner_id', ownerId)
  return state
}

export async function upsertManualPosition(
  ownerId: string,
  input: Omit<ManualPosition, 'id' | 'updatedAt'>,
): Promise<ManualPosition> {
  if (!validOwnerId(ownerId)) throw new Error('A persisted authenticated user is required')
  const supabase = getSupabaseClient()
  if (!supabase) throw new Error('Supabase service credentials are not configured')
  const { data, error } = await supabase.from('manual_positions').upsert({
    owner_id: ownerId,
    symbol: input.symbol.toUpperCase(),
    shares: input.shares,
    cost_basis_per_share: input.costBasisPerShare,
    opened_at: input.openedAt,
    notes: input.notes,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'owner_id,symbol' }).select('*').single()
  if (error || !data) throw new Error(`Unable to save manual position: ${error?.message ?? 'unknown error'}`)
  return normalizePosition(data)
}

export async function saveThesisDecision(
  ownerId: string,
  input: Omit<ThesisDecision, 'id' | 'version' | 'priceAtDecision' | 'createdAt'>,
): Promise<ThesisDecision> {
  if (!validOwnerId(ownerId)) throw new Error('A persisted authenticated user is required')
  const supabase = getSupabaseClient()
  if (!supabase) throw new Error('Supabase service credentials are not configured')
  const [{ data: prior }, { data: snapshot }] = await Promise.all([
    supabase.from('thesis_decisions').select('version').eq('owner_id', ownerId).eq('symbol', input.symbol.toUpperCase())
      .order('version', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('market_snapshots').select('id').eq('status', 'complete').eq('is_latest', true).maybeSingle(),
  ])
  const { data: current } = snapshot
    ? await supabase.from('screener_rows').select('price').eq('snapshot_id', snapshot.id)
      .eq('symbol', input.symbol.toUpperCase()).maybeSingle()
    : { data: null }
  const { data, error } = await supabase.from('thesis_decisions').insert({
    owner_id: ownerId,
    symbol: input.symbol.toUpperCase(),
    version: Number(prior?.version ?? 0) + 1,
    disposition: input.disposition,
    formal_rating: input.formalRating,
    entry_action: input.entryAction,
    fair_value: input.fairValue,
    entry_zone_low: input.entryZoneLow,
    entry_zone_high: input.entryZoneHigh,
    conviction: input.conviction,
    next_catalyst: input.nextCatalyst,
    kill_criteria: input.killCriteria,
    rationale: input.rationale,
    price_at_decision: current ? Number(current.price) : null,
  }).select('*').single()
  if (error || !data) throw new Error(`Unable to save thesis decision: ${error?.message ?? 'unknown error'}`)
  return normalizeDecision(data)
}

export async function saveDecisionReview(
  ownerId: string,
  input: Omit<DecisionReview, 'id' | 'symbol' | 'reviewedAt'>,
): Promise<DecisionReview> {
  if (!validOwnerId(ownerId)) throw new Error('A persisted authenticated user is required')
  const supabase = getSupabaseClient()
  if (!supabase) throw new Error('Supabase service credentials are not configured')
  const { data: decision } = await supabase.from('thesis_decisions').select('symbol')
    .eq('id', input.decisionId).eq('owner_id', ownerId).maybeSingle()
  if (!decision) throw new Error('The decision version does not belong to this workspace')
  const { data, error } = await supabase.from('decision_reviews').upsert({
    owner_id: ownerId,
    decision_id: input.decisionId,
    symbol: decision.symbol,
    outcome: input.outcome,
    expectation_assessment: input.expectationAssessment,
    lessons: input.lessons,
    postmortem: input.postmortem,
    reviewed_at: new Date().toISOString(),
  }, { onConflict: 'owner_id,decision_id' }).select('*').single()
  if (error || !data) throw new Error(`Unable to save decision review: ${error?.message ?? 'unknown error'}`)
  return normalizeReview(data)
}

export async function updateInboxStatus(
  ownerId: string,
  itemId: string,
  status: DecisionInboxItem['status'],
): Promise<void> {
  if (!validOwnerId(ownerId)) throw new Error('A persisted authenticated user is required')
  const supabase = getSupabaseClient()
  if (!supabase) throw new Error('Supabase service credentials are not configured')
  const { error } = await supabase.from('decision_inbox_items').update({ status }).eq('id', itemId).eq('owner_id', ownerId)
  if (error) throw new Error(`Unable to update inbox item: ${error.message}`)
}

export async function fetchLatestDecision(ownerId: string, symbol: string): Promise<ThesisDecision | null> {
  const supabase = getSupabaseClient()
  if (!supabase || !validOwnerId(ownerId)) return null
  const { data } = await supabase.from('thesis_decisions').select('*').eq('owner_id', ownerId).eq('symbol', symbol)
    .order('created_at', { ascending: false }).limit(1).maybeSingle()
  return data ? normalizeDecision(data) : null
}

export async function fetchManualPosition(ownerId: string, symbol: string): Promise<ManualPosition | null> {
  const supabase = getSupabaseClient()
  if (!supabase || !validOwnerId(ownerId)) return null
  const { data } = await supabase.from('manual_positions').select('*').eq('owner_id', ownerId).eq('symbol', symbol).maybeSingle()
  return data ? normalizePosition(data) : null
}

export async function addSymbolToPrimaryWatchlist(ownerId: string, symbolInput: string): Promise<void> {
  if (!validOwnerId(ownerId)) throw new Error('A persisted authenticated user is required')
  const supabase = getSupabaseClient()
  if (!supabase) throw new Error('Supabase service credentials are not configured')
  const symbol = symbolInput.trim().toUpperCase()
  let { data: list } = await supabase.from('market_watchlists').select('id').eq('owner_id', ownerId)
    .order('created_at', { ascending: true }).limit(1).maybeSingle()
  if (!list) {
    const { data, error } = await supabase.from('market_watchlists').insert({
      owner_id: ownerId,
      client_id: 'core',
      name: 'Core',
    }).select('id').single()
    if (error || !data) throw new Error(`Unable to create primary watchlist: ${error?.message ?? 'unknown error'}`)
    list = data
  }
  const { error } = await supabase.from('market_watchlist_items').upsert({
    watchlist_id: list.id,
    symbol,
  }, { onConflict: 'watchlist_id,symbol', ignoreDuplicates: true })
  if (error) throw new Error(`Unable to add ${symbol} to the watchlist: ${error.message}`)
}

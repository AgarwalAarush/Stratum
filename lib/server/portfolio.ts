import {
  createDefaultWatchlistState,
  parseWatchlistState,
  type MarketWatchlistState,
} from '../markets/watchlists.ts'
import type {
  DecisionReview,
  DecisionInboxItem,
  ManualPosition,
  PortfolioAccount,
  PortfolioAccountSummary,
  PortfolioHolding,
  PortfolioTransaction,
  PortfolioTransactionAction,
  PortfolioWorkspaceData,
  ThesisDecision,
  ThesisKillCriterion,
} from '../markets/types.ts'
import { validatePortfolioUpdate, type ParsedPortfolioUpdate } from '../markets/portfolio-updates.ts'
import { getAlpacaClient } from './alpaca.ts'
import { getSupabaseClient } from './supabase.ts'

function validOwnerId(ownerId: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(ownerId)
}

function numberOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

async function ensureWatchlistAssets(symbols: string[]): Promise<void> {
  if (symbols.length === 0) return
  const supabase = getSupabaseClient()
  if (!supabase) throw new Error('Supabase service credentials are not configured')
  const { data: existing, error: existingError } = await supabase
    .from('market_assets')
    .select('symbol')
    .in('symbol', symbols)
  if (existingError) throw new Error(`Unable to check watchlist coverage: ${existingError.message}`)
  const covered = new Set((existing ?? []).map((row: { symbol: string }) => row.symbol))
  const missing = symbols.filter((symbol) => !covered.has(symbol))
  if (missing.length === 0) return

  const client = getAlpacaClient()
  // The public Vercel read/write surface intentionally does not require the
  // worker's Alpaca credentials. When they are absent, retain a pending asset
  // record instead; the private worker will replace it during its next sync.
  const assets = client
    ? await Promise.all(missing.map((symbol) => client.fetchAsset(symbol)))
    : missing.map(() => null)
  const now = new Date().toISOString()
  const records = missing.map((symbol, index) => {
    const asset = assets[index]
    if (asset?.active && asset.tradable) {
      return {
        symbol: asset.symbol,
        name: asset.name,
        exchange: asset.exchange,
        asset_class: asset.assetClass,
        status: 'active',
        tradable: asset.tradable,
        active: asset.active,
        source: 'alpaca-watchlist',
        source_as_of: now,
        raw: {},
        updated_at: now,
      }
    }
    // Keep a valid requested ticker durable without presenting it as a
    // tradable Alpaca asset or inventing quote data. A future asset sync can
    // replace this record with verified catalog metadata.
    return {
      symbol,
      name: `Watchlist coverage requested for ${symbol}`,
      exchange: 'unresolved',
      asset_class: 'us_equity',
      status: 'unresolved',
      tradable: false,
      active: false,
      source: 'watchlist-request',
      source_as_of: now,
      raw: { requestedBy: 'watchlist' },
      updated_at: now,
    }
  })
  const { error } = await supabase.from('market_assets').upsert(records, { onConflict: 'symbol' })
  if (error) throw new Error(`Unable to add watchlist market coverage: ${error.message}`)
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
    investmentThesisId: row.investment_thesis_id === null || row.investment_thesis_id === undefined ? null : String(row.investment_thesis_id),
    researchNoteId: row.research_note_id === null || row.research_note_id === undefined ? null : String(row.research_note_id),
  }
}

/** Shared read-model adapter for the thesis workspace. Persistence remains in
 * this module so both stock and thesis views render the same decision version. */
export function normalizeDecisionForThesisWorkspace(row: Record<string, unknown>): ThesisDecision {
  return normalizeDecision(row)
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

function normalizePortfolioAccount(row: Record<string, unknown>): PortfolioAccount {
  return {
    id: String(row.id),
    name: String(row.name),
    kind: row.kind === 'brokerage' ? 'brokerage' : 'manual',
    initialFunds: Number(row.initial_funds ?? 0),
    startedAt: String(row.started_at),
    createdAt: String(row.created_at),
  }
}

function normalizePortfolioTransaction(row: Record<string, unknown>): PortfolioTransaction {
  return {
    id: String(row.id),
    portfolioId: String(row.portfolio_id),
    action: row.action as PortfolioTransactionAction,
    symbol: row.symbol === null ? null : String(row.symbol),
    quantity: numberOrNull(row.quantity),
    pricePerShare: numberOrNull(row.price_per_share),
    fees: Number(row.fees ?? 0),
    occurredAt: String(row.occurred_at),
    notes: String(row.notes ?? ''),
    source: row.source as PortfolioTransaction['source'],
    voidedAt: row.voided_at === null ? null : String(row.voided_at ?? ''),
    voidReason: row.void_reason === null ? null : String(row.void_reason ?? ''),
    replacedById: row.replaced_by_id === null ? null : String(row.replaced_by_id ?? ''),
    createdAt: String(row.created_at),
  }
}

export interface PortfolioQuote {
  symbol: string
  price: number
}

interface BrokerageSnapshot {
  capturedAt: string
  cashBalance: number
  equityValue: number
  totalValue: number
  positions: Array<{
    symbol: string
    quantity: number
    costBasisPerShare: number
    currentPrice: number | null
    quoteAsOf: string | null
  }>
}

function calculatePortfolioSummary(
  account: PortfolioAccount,
  transactions: PortfolioTransaction[],
  quotes: Map<string, number>,
): PortfolioAccountSummary {
  let cashBalance = account.initialFunds
  const positions = new Map<string, { quantity: number, totalCost: number }>()
  for (const transaction of transactions) {
    const amount = (transaction.quantity ?? 0) * (transaction.pricePerShare ?? 0)
    if (transaction.action === 'cash_deposit') cashBalance += transaction.pricePerShare ?? 0
    if (transaction.action === 'cash_withdrawal') cashBalance -= transaction.pricePerShare ?? 0
    if (transaction.action === 'buy') {
      cashBalance -= amount + transaction.fees
      const position = positions.get(transaction.symbol!) ?? { quantity: 0, totalCost: 0 }
      position.quantity += transaction.quantity ?? 0
      position.totalCost += amount + transaction.fees
      positions.set(transaction.symbol!, position)
    }
    if (transaction.action === 'position_import') {
      const position = positions.get(transaction.symbol!) ?? { quantity: 0, totalCost: 0 }
      position.quantity += transaction.quantity ?? 0
      position.totalCost += amount
      positions.set(transaction.symbol!, position)
    }
    if (transaction.action === 'sell') {
      cashBalance += amount - transaction.fees
      const position = positions.get(transaction.symbol!)
      if (!position || position.quantity <= 0) continue
      const sold = Math.min(transaction.quantity ?? 0, position.quantity)
      position.totalCost -= (position.totalCost / position.quantity) * sold
      position.quantity -= sold
      if (position.quantity <= 0.00000001) positions.delete(transaction.symbol!)
    }
  }
  const holdings: PortfolioHolding[] = [...positions.entries()].map(([symbol, position]) => {
    const currentPrice = quotes.get(symbol) ?? null
    const currentValue = currentPrice === null ? null : currentPrice * position.quantity
    return {
      symbol,
      quantity: position.quantity,
      costBasisPerShare: position.totalCost / position.quantity,
      totalCost: position.totalCost,
      currentPrice,
      currentValue,
      unrealizedPnl: currentValue === null ? null : currentValue - position.totalCost,
    }
  }).sort((left, right) => right.totalCost - left.totalCost)
  const investedCost = holdings.reduce((total, holding) => total + holding.totalCost, 0)
  const allQuotesAvailable = holdings.every((holding) => holding.currentValue !== null)
  const marketValue = allQuotesAvailable ? holdings.reduce((total, holding) => total + (holding.currentValue ?? 0), 0) : null
  return {
    account,
    cashBalance,
    investedCost,
    marketValue,
    totalValue: marketValue === null ? null : cashBalance + marketValue,
    unrealizedPnl: marketValue === null ? null : marketValue - investedCost,
    holdings,
    dataSource: 'ledger',
    dataAsOf: null,
  }
}

export function normalizeBrokerageSnapshot(row: Record<string, unknown>): BrokerageSnapshot | null {
  const accountRows = Array.isArray(row.brokerage_account_snapshots)
    ? row.brokerage_account_snapshots
    : [row.brokerage_account_snapshots]
  const account = record(accountRows[0])
  const capturedAt = typeof row.captured_at === 'string' ? row.captured_at : null
  const cashBalance = numberOrNull(account?.cash_balance)
  const equityValue = numberOrNull(account?.equity_value)
  const totalValue = numberOrNull(account?.total_value)
  if (!capturedAt || cashBalance === null || equityValue === null || totalValue === null) return null
  const positions = (Array.isArray(row.brokerage_position_snapshots) ? row.brokerage_position_snapshots : []).flatMap((value) => {
    const position = record(value)
    const symbol = typeof position?.symbol === 'string' ? position.symbol : ''
    const quantity = numberOrNull(position?.quantity)
    const costBasisPerShare = numberOrNull(position?.cost_basis_per_share)
    if (!symbol || quantity === null || quantity <= 0 || costBasisPerShare === null || costBasisPerShare < 0) return []
    return [{
      symbol,
      quantity,
      costBasisPerShare,
      currentPrice: numberOrNull(position?.current_price),
      quoteAsOf: typeof position?.quote_as_of === 'string' ? position.quote_as_of : null,
    }]
  })
  return { capturedAt, cashBalance, equityValue, totalValue, positions }
}

function calculateBrokeragePortfolioSummary(
  account: PortfolioAccount,
  snapshot: BrokerageSnapshot,
  quotes: Map<string, number>,
): PortfolioAccountSummary {
  const holdings = snapshot.positions.map((position) => {
    const currentPrice = position.currentPrice ?? quotes.get(position.symbol) ?? null
    const totalCost = position.quantity * position.costBasisPerShare
    const currentValue = currentPrice === null ? null : currentPrice * position.quantity
    return {
      symbol: position.symbol,
      quantity: position.quantity,
      costBasisPerShare: position.costBasisPerShare,
      totalCost,
      currentPrice,
      currentValue,
      unrealizedPnl: currentValue === null ? null : currentValue - totalCost,
    }
  }).sort((left, right) => right.totalCost - left.totalCost)
  const investedCost = holdings.reduce((total, holding) => total + holding.totalCost, 0)
  return {
    account,
    cashBalance: snapshot.cashBalance,
    investedCost,
    marketValue: snapshot.equityValue,
    totalValue: snapshot.totalValue,
    unrealizedPnl: snapshot.equityValue - investedCost,
    holdings,
    dataSource: 'robinhood',
    dataAsOf: snapshot.capturedAt,
  }
}

function normalizeInbox(row: Record<string, unknown>): DecisionInboxItem {
  return {
    id: String(row.id),
    portfolioId: row.portfolio_id === null ? null : String(row.portfolio_id ?? ''),
    type: row.item_type as DecisionInboxItem['type'],
    symbol: row.symbol === null ? null : String(row.symbol),
    title: String(row.title),
    summary: String(row.summary),
    evidence: Array.isArray(row.evidence) ? row.evidence as DecisionInboxItem['evidence'] : [],
    investmentThesisId: row.investment_thesis_id === null ? null : String(row.investment_thesis_id ?? ''),
    thesisMonitorId: row.thesis_monitor_id === null ? null : String(row.thesis_monitor_id ?? ''),
    entityKey: row.entity_key === null ? null : String(row.entity_key ?? ''),
    severity: (row.severity ?? 'attention') as DecisionInboxItem['severity'],
    status: row.status as DecisionInboxItem['status'],
    dedupeKey: String(row.dedupe_key),
    occurredAt: String(row.occurred_at),
    createdAt: String(row.created_at),
  }
}

export async function fetchPortfolioWorkspace(
  ownerId: string,
  availableQuotes: PortfolioQuote[] = [],
): Promise<PortfolioWorkspaceData> {
  const fallback = createDefaultWatchlistState(availableQuotes.map((quote) => quote.symbol))
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
      portfolios: [],
      portfolioTransactions: [],
    }
  }
  const [
    { data: listRows },
    { data: positionRows },
    { data: decisionRows },
    { data: reviewRows },
    { data: inboxRows },
    { data: portfolioRows },
    { data: portfolioTransactionRows },
    { data: brokerageRows },
  ] = await Promise.all([
    supabase.from('market_watchlists').select('id,client_id,name,market_watchlist_items(symbol)').eq('owner_id', ownerId).order('created_at'),
    supabase.from('manual_positions').select('*').eq('owner_id', ownerId).order('updated_at', { ascending: false }),
    supabase.from('thesis_decisions').select('*').eq('owner_id', ownerId).order('created_at', { ascending: false }),
    supabase.from('decision_reviews').select('*').eq('owner_id', ownerId).order('reviewed_at', { ascending: false }),
    supabase.from('decision_inbox_items').select('*').eq('owner_id', ownerId).eq('status', 'open').not('portfolio_id', 'is', null).order('occurred_at', { ascending: false }),
    supabase.from('portfolios').select('*').eq('owner_id', ownerId).order('created_at'),
    supabase.from('portfolio_transactions').select('*').eq('owner_id', ownerId).order('occurred_at', { ascending: true }).order('created_at', { ascending: true }),
    supabase.from('brokerage_sync_runs')
      .select('portfolio_id,captured_at,brokerage_account_snapshots(cash_balance,equity_value,total_value),brokerage_position_snapshots(symbol,quantity,cost_basis_per_share,current_price,quote_as_of)')
      .eq('owner_id', ownerId)
      .eq('status', 'succeeded')
      .order('captured_at', { ascending: false }),
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
  const portfolioTransactions = (portfolioTransactionRows ?? []).map((row) => normalizePortfolioTransaction(row))
  const quotes = new Map(availableQuotes.map((quote) => [quote.symbol, quote.price]))
  const latestBrokerageSnapshotByPortfolio = new Map<string, BrokerageSnapshot>()
  for (const row of brokerageRows ?? []) {
    const portfolioId = typeof row.portfolio_id === 'string' ? row.portfolio_id : ''
    if (!portfolioId || latestBrokerageSnapshotByPortfolio.has(portfolioId)) continue
    const snapshot = normalizeBrokerageSnapshot(row)
    if (snapshot) latestBrokerageSnapshotByPortfolio.set(portfolioId, snapshot)
  }
  const portfolios = (portfolioRows ?? []).map((row) => normalizePortfolioAccount(row)).map((account) => {
    const brokerageSnapshot = account.kind === 'brokerage' ? latestBrokerageSnapshotByPortfolio.get(account.id) : null
    if (brokerageSnapshot) return calculateBrokeragePortfolioSummary(account, brokerageSnapshot, quotes)
    return calculatePortfolioSummary(
      account,
      portfolioTransactions.filter((transaction) => transaction.portfolioId === account.id && transaction.voidedAt === null),
      quotes,
    )
  })
  return {
    watchlists,
    watchlistsPersisted: lists.length > 0,
    positions: (positionRows ?? []).map((row) => normalizePosition(row)),
    decisions: [...latestDecisionBySymbol.values()],
    decisionHistory,
    reviews: (reviewRows ?? []).map((row) => normalizeReview(row)),
    inbox: (inboxRows ?? []).map((row) => normalizeInbox(row)),
    portfolios,
    portfolioTransactions,
  }
}

export async function recordPortfolioTransaction(
  ownerId: string,
  portfolioId: string,
  input: ParsedPortfolioUpdate,
  source: PortfolioTransaction['source'],
  replacingId?: string,
): Promise<PortfolioTransaction> {
  if (!validOwnerId(ownerId)) throw new Error('A persisted authenticated user is required')
  const validationError = validatePortfolioUpdate(input)
  if (validationError) throw new Error(validationError)
  const supabase = getSupabaseClient()
  if (!supabase) throw new Error('Supabase service credentials are not configured')
  const { data: portfolio } = await supabase.from('portfolios').select('id').eq('id', portfolioId).eq('owner_id', ownerId).maybeSingle()
  if (!portfolio) throw new Error('Choose one of your portfolios')
  await assertPortfolioUpdateCanSettle(ownerId, portfolioId, input, replacingId)
  const { data, error } = await supabase.from('portfolio_transactions').insert({
    owner_id: ownerId,
    portfolio_id: portfolioId,
    action: input.action,
    symbol: input.symbol,
    quantity: input.quantity,
    price_per_share: input.pricePerShare,
    fees: input.fees,
    occurred_at: input.occurredAt,
    notes: input.notes,
    source,
  }).select('*').single()
  if (error || !data) throw new Error(`Unable to record portfolio update: ${error?.message ?? 'unknown error'}`)
  return normalizePortfolioTransaction(data)
}

async function activePortfolioTransactions(ownerId: string, portfolioId: string): Promise<PortfolioTransaction[]> {
  const supabase = getSupabaseClient()
  if (!supabase) throw new Error('Supabase service credentials are not configured')
  const { data, error } = await supabase.from('portfolio_transactions').select('*')
    .eq('portfolio_id', portfolioId).eq('owner_id', ownerId).is('voided_at', null)
    .order('occurred_at', { ascending: true }).order('created_at', { ascending: true })
  if (error) throw new Error(`Unable to load portfolio entries: ${error.message}`)
  return (data ?? []).map((row) => normalizePortfolioTransaction(row))
}

function assertTransactionsCanSettle(transactions: PortfolioTransaction[]) {
  const available = new Map<string, number>()
  for (const transaction of transactions) {
    if (!transaction.symbol) continue
    if (transaction.action === 'buy' || transaction.action === 'position_import') {
      available.set(transaction.symbol, (available.get(transaction.symbol) ?? 0) + (transaction.quantity ?? 0))
      continue
    }
    if (transaction.action === 'sell') {
      const shares = available.get(transaction.symbol) ?? 0
      if (shares + 0.00000001 < (transaction.quantity ?? 0)) {
        throw new Error(`Cannot sell ${transaction.quantity} ${transaction.symbol} shares; this correction would exceed the portfolio balance`)
      }
      available.set(transaction.symbol, shares - (transaction.quantity ?? 0))
    }
  }
}

function transactionFromUpdate(update: ParsedPortfolioUpdate, portfolioId: string): PortfolioTransaction {
  return {
    id: 'pending-correction', portfolioId, action: update.action, symbol: update.symbol,
    quantity: update.quantity, pricePerShare: update.pricePerShare, fees: update.fees,
    occurredAt: update.occurredAt, notes: update.notes, source: 'manual',
    voidedAt: null, voidReason: null, replacedById: null, createdAt: new Date().toISOString(),
  }
}

async function assertPortfolioUpdateCanSettle(ownerId: string, portfolioId: string, update: ParsedPortfolioUpdate, replacingId?: string) {
  const transactions = await activePortfolioTransactions(ownerId, portfolioId)
  assertTransactionsCanSettle([
    ...transactions.filter((transaction) => transaction.id !== replacingId),
    transactionFromUpdate(update, portfolioId),
  ].sort((left, right) => left.occurredAt.localeCompare(right.occurredAt) || left.createdAt.localeCompare(right.createdAt)))
}

export async function correctPortfolioTransaction(ownerId: string, transactionId: string, input: ParsedPortfolioUpdate): Promise<PortfolioTransaction> {
  if (!validOwnerId(ownerId)) throw new Error('A persisted authenticated user is required')
  const validationError = validatePortfolioUpdate(input)
  if (validationError) throw new Error(validationError)
  const supabase = getSupabaseClient()
  if (!supabase) throw new Error('Supabase service credentials are not configured')
  const { data: original } = await supabase.from('portfolio_transactions').select('*')
    .eq('id', transactionId).eq('owner_id', ownerId).is('voided_at', null).maybeSingle()
  if (!original) throw new Error('That ledger entry is no longer available')
  const normalizedOriginal = normalizePortfolioTransaction(original)
  if (normalizedOriginal.source === 'import' || normalizedOriginal.action === 'position_import') {
    throw new Error('Imported or brokerage entries cannot be changed here')
  }
  await assertPortfolioUpdateCanSettle(ownerId, normalizedOriginal.portfolioId, input, transactionId)
  const replacement = await recordPortfolioTransaction(ownerId, normalizedOriginal.portfolioId, input, 'manual', transactionId)
  const { error } = await supabase.from('portfolio_transactions').update({
    voided_at: new Date().toISOString(), void_reason: 'corrected', replaced_by_id: replacement.id,
  }).eq('id', transactionId).eq('owner_id', ownerId).is('voided_at', null)
  if (error) throw new Error(`Unable to finalize correction: ${error.message}`)
  return replacement
}

export async function voidPortfolioTransaction(ownerId: string, transactionId: string): Promise<void> {
  if (!validOwnerId(ownerId)) throw new Error('A persisted authenticated user is required')
  const supabase = getSupabaseClient()
  if (!supabase) throw new Error('Supabase service credentials are not configured')
  const { data } = await supabase.from('portfolio_transactions').select('*')
    .eq('id', transactionId).eq('owner_id', ownerId).is('voided_at', null).maybeSingle()
  if (!data) throw new Error('That ledger entry is no longer available')
  const original = normalizePortfolioTransaction(data)
  if (original.source === 'import' || original.action === 'position_import') throw new Error('Imported or brokerage entries cannot be removed here')
  const active = await activePortfolioTransactions(ownerId, original.portfolioId)
  assertTransactionsCanSettle(active.filter((transaction) => transaction.id !== transactionId))
  const { error } = await supabase.from('portfolio_transactions').update({
    voided_at: new Date().toISOString(), void_reason: 'removed',
  }).eq('id', transactionId).eq('owner_id', ownerId).is('voided_at', null)
  if (error) throw new Error(`Unable to remove ledger entry: ${error.message}`)
}

export async function replaceUserWatchlists(ownerId: string, input: unknown): Promise<MarketWatchlistState> {
  if (!validOwnerId(ownerId)) throw new Error('A persisted authenticated user is required')
  const supabase = getSupabaseClient()
  if (!supabase) throw new Error('Supabase service credentials are not configured')
  const state = parseWatchlistState(input, createDefaultWatchlistState([]))
  await ensureWatchlistAssets([...new Set(state.lists.flatMap((list) => list.symbols))])
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
  input: Omit<ThesisDecision, 'id' | 'version' | 'priceAtDecision' | 'createdAt' | 'researchNoteId'>,
): Promise<ThesisDecision> {
  if (!validOwnerId(ownerId)) throw new Error('A persisted authenticated user is required')
  const supabase = getSupabaseClient()
  if (!supabase) throw new Error('Supabase service credentials are not configured')
  if (!input.investmentThesisId) throw new Error('Accept a company thesis before recording a capital decision')
  if (!input.rationale.trim()) throw new Error('Record the rationale for this capital decision')
  const [{ data: thesis, error: thesisError }, { data: prior }, { data: snapshot }] = await Promise.all([
    supabase.from('investment_theses').select('id,symbol,research_note_id').eq('id', input.investmentThesisId)
      .eq('owner_id', ownerId).eq('status', 'accepted').maybeSingle(),
    supabase.from('thesis_decisions').select('version').eq('owner_id', ownerId).eq('symbol', input.symbol.toUpperCase())
      .order('version', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('market_snapshots').select('id').eq('status', 'complete').eq('is_latest', true).maybeSingle(),
  ])
  if (thesisError) throw new Error(`Unable to verify the company thesis: ${thesisError.message}`)
  if (!thesis || String(thesis.symbol ?? '').toUpperCase() !== input.symbol.toUpperCase()) {
    throw new Error('Capital decisions must be linked to the accepted thesis for this company')
  }
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
    investment_thesis_id: thesis.id,
    research_note_id: thesis.research_note_id,
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

import { fetchAuthoritativePortfolios } from './portfolio.ts'
import type { ResearchJobStatus } from '../markets/types.ts'
import { getSupabaseClient } from './supabase.ts'

export type PortfolioResearchPriority = 'owned' | 'watchlisted' | 'adjacent'

export interface PortfolioResearchTarget {
  symbol: string
  priority: PortfolioResearchPriority
  reason: string
  relatedTo: string[]
}

export interface PortfolioResearchCoverage {
  ownedSymbols: string[]
  watchlistedSymbols: string[]
  adjacentSymbols: string[]
  coveredSymbols: string[]
  queuedSymbols: string[]
  targets: PortfolioResearchTarget[]
}

interface WatchlistRow {
  symbol: string
  market_watchlists: { owner_id: string | null } | Array<{ owner_id: string | null }> | null
}

interface ResearchRow {
  symbol: string
  status: ResearchJobStatus['status'] | 'complete'
  generated_at: string
}

interface PacketRow {
  symbol: string
  packet: unknown
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function symbols(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && /^[A-Z][A-Z0-9.-]{0,11}$/.test(item.trim().toUpperCase()))
      .map((item) => item.trim().toUpperCase())
    : []
}

function watchlistOwner(row: WatchlistRow): string | null {
  const joined = Array.isArray(row.market_watchlists) ? row.market_watchlists[0] : row.market_watchlists
  return joined && typeof joined.owner_id === 'string' ? joined.owner_id : null
}

function latestStatusBySymbol(rows: ResearchRow[]): Map<string, ResearchRow> {
  const latest = new Map<string, ResearchRow>()
  for (const row of rows) {
    const current = latest.get(row.symbol)
    if (!current || row.generated_at > current.generated_at) latest.set(row.symbol, row)
  }
  return latest
}

/**
 * This is deliberately a coverage planner, not a recommender. Holdings earn
 * research priority because the owner is already exposed; ticker peers are
 * merely adjacent investigation candidates until independently researched.
 */
export function buildPortfolioResearchCoverage(input: {
  ownedSymbols: Iterable<string>
  watchlistedSymbols: Iterable<string>
  peerSymbolsByOwnedSymbol: ReadonlyMap<string, readonly string[]>
  researchBySymbol: ReadonlyMap<string, Pick<ResearchRow, 'status' | 'generated_at'>>
  availableSymbols: ReadonlySet<string>
  now?: Date
  maxTargets?: number
}): PortfolioResearchCoverage {
  const now = input.now ?? new Date()
  const ownedSymbols = [...new Set([...input.ownedSymbols].map((symbol) => symbol.toUpperCase()))]
    .filter((symbol) => input.availableSymbols.has(symbol)).sort()
  const ownedSet = new Set(ownedSymbols)
  const watchlistedSymbols = [...new Set([...input.watchlistedSymbols].map((symbol) => symbol.toUpperCase()))]
    .filter((symbol) => input.availableSymbols.has(symbol) && !ownedSet.has(symbol)).sort()
  const tracked = new Set([...ownedSymbols, ...watchlistedSymbols])
  const relatedToByPeer = new Map<string, string[]>()
  for (const symbol of ownedSymbols) {
    for (const peer of input.peerSymbolsByOwnedSymbol.get(symbol) ?? []) {
      const normalized = peer.toUpperCase()
      if (!input.availableSymbols.has(normalized) || tracked.has(normalized)) continue
      relatedToByPeer.set(normalized, [...new Set([...(relatedToByPeer.get(normalized) ?? []), symbol])])
    }
  }
  const adjacentSymbols = [...relatedToByPeer.keys()].sort((left, right) => {
    const difference = (relatedToByPeer.get(right)?.length ?? 0) - (relatedToByPeer.get(left)?.length ?? 0)
    return difference || left.localeCompare(right)
  })
  const staleAfter = now.getTime() - 35 * 24 * 60 * 60 * 1_000
  const needsResearch = (symbol: string) => {
    const research = input.researchBySymbol.get(symbol)
    if (!research) return true
    if (research.status === 'queued' || research.status === 'running') return false
    return research.status !== 'complete' || Date.parse(research.generated_at) < staleAfter
  }
  const candidates: PortfolioResearchTarget[] = [
    ...ownedSymbols.map((symbol) => ({ symbol, priority: 'owned' as const, reason: 'portfolio-owned-preemptive', relatedTo: [] })),
    ...watchlistedSymbols.map((symbol) => ({ symbol, priority: 'watchlisted' as const, reason: 'portfolio-watchlist-preemptive', relatedTo: [] })),
    ...adjacentSymbols.map((symbol) => ({ symbol, priority: 'adjacent' as const, reason: 'portfolio-adjacent-preemptive', relatedTo: relatedToByPeer.get(symbol) ?? [] })),
  ]
  const targets = candidates.filter((candidate) => needsResearch(candidate.symbol)).slice(0, input.maxTargets ?? 4)
  const coveredSymbols = [...input.researchBySymbol.entries()]
    .filter(([, research]) => research.status === 'complete')
    .map(([symbol]) => symbol)
  const queuedSymbols = [...input.researchBySymbol.entries()]
    .filter(([, research]) => research.status === 'queued' || research.status === 'running')
    .map(([symbol]) => symbol)
  return { ownedSymbols, watchlistedSymbols, adjacentSymbols, coveredSymbols, queuedSymbols, targets }
}

export async function fetchPortfolioResearchCoverage(ownerId: string, options: { now?: Date; maxTargets?: number } = {}): Promise<PortfolioResearchCoverage> {
  const supabase = getSupabaseClient()
  if (!supabase) return { ownedSymbols: [], watchlistedSymbols: [], adjacentSymbols: [], coveredSymbols: [], queuedSymbols: [], targets: [] }
  const [portfolios, watchlistsResult, researchResult, packetsResult] = await Promise.all([
    fetchAuthoritativePortfolios(ownerId),
    supabase.from('market_watchlist_items').select('symbol,market_watchlists!inner(owner_id)').eq('market_watchlists.owner_id', ownerId),
    supabase.from('equity_research_notes').select('symbol,status,generated_at').eq('owner_id', ownerId).order('generated_at', { ascending: false }).limit(500),
    supabase.from('company_packets').select('symbol,packet').eq('owner_id', ownerId).eq('status', 'complete').order('generated_at', { ascending: false }).limit(500),
  ])
  const error = watchlistsResult.error ?? researchResult.error ?? packetsResult.error
  if (error) throw new Error(`Unable to build portfolio research coverage: ${error.message}`)
  const shares = new Map<string, number>()
  for (const portfolio of portfolios) for (const holding of portfolio.holdings) shares.set(holding.symbol, (shares.get(holding.symbol) ?? 0) + holding.quantity)
  const ownedSymbols = [...shares].flatMap(([symbol, quantity]) => quantity > 0 ? [symbol] : [])
  const watchlistedSymbols = (watchlistsResult.data ?? []).flatMap((row) => {
    const item = row as WatchlistRow
    return watchlistOwner(item) === ownerId ? [item.symbol] : []
  })
  const peerSymbolsByOwnedSymbol = new Map<string, string[]>()
  for (const row of (packetsResult.data ?? []) as PacketRow[]) {
    if (!shares.has(row.symbol) || (shares.get(row.symbol) ?? 0) <= 0.00000001 || peerSymbolsByOwnedSymbol.has(row.symbol)) continue
    peerSymbolsByOwnedSymbol.set(row.symbol, symbols(record(row.packet).peers))
  }
  const researchBySymbol = latestStatusBySymbol((researchResult.data ?? []) as ResearchRow[])
  const allCandidates = [...new Set([...ownedSymbols, ...watchlistedSymbols, ...[...peerSymbolsByOwnedSymbol.values()].flat()])]
  const { data: assets, error: assetError } = allCandidates.length > 0
    ? await supabase.from('market_assets').select('symbol,name').in('symbol', allCandidates)
    : { data: [], error: null }
  if (assetError) throw new Error(`Unable to verify portfolio research symbols: ${assetError.message}`)
  return buildPortfolioResearchCoverage({
    ownedSymbols,
    watchlistedSymbols,
    peerSymbolsByOwnedSymbol,
    researchBySymbol,
    // This lane is intentionally company-only. ETF research has its own
    // issuer-backed pipeline and should never become an accidental peer lead.
    availableSymbols: new Set((assets ?? []).flatMap((row) => /\b(?:ETF|index fund|exchange[- ]traded fund)\b/i.test(String(row.name ?? '')) ? [] : [String(row.symbol)])),
    now: options.now,
    maxTargets: options.maxTargets,
  })
}

export async function fetchPortfolioResearchSeedOwners(): Promise<string[]> {
  const supabase = getSupabaseClient()
  if (!supabase) return []
  const { data, error } = await supabase.from('portfolios').select('owner_id').limit(100)
  if (error) throw new Error(`Unable to load portfolio research owners: ${error.message}`)
  return [...new Set((data ?? []).map((row) => row.owner_id).filter((ownerId): ownerId is string => typeof ownerId === 'string'))]
}

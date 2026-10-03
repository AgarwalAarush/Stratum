import { fetchAuthoritativePortfolios } from './portfolio.ts'
import type { ResearchJobStatus } from '../markets/types.ts'
import { getSupabaseClient } from './supabase.ts'
import { hasCurrentResearchContract } from '../markets/research-contract.ts'

export type PortfolioResearchPriority = 'owned' | 'watchlisted' | 'adjacent'

export interface PortfolioResearchTarget {
  symbol: string
  priority: PortfolioResearchPriority
  reason: string
  relatedTo: string[]
  instrumentType?: 'equity' | 'etf'
}

export interface PortfolioResearchCoverage {
  ownedSymbols: string[]
  watchlistedSymbols: string[]
  adjacentSymbols: string[]
  coveredSymbols: string[]
  queuedSymbols: string[]
  targets: PortfolioResearchTarget[]
  unavailableSymbols: string[]
}

interface WatchlistRow {
  symbol: string
  market_watchlists: { owner_id: string | null } | Array<{ owner_id: string | null }> | null
}

interface ResearchRow {
  symbol: string
  status: ResearchJobStatus['status'] | 'complete'
  generated_at: string
  research_contract_version?: number | null
  content?: unknown
}

interface PacketRow {
  symbol: string
  peers: unknown
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

/** Read only the latest tracked versions, without loading historical report
 * bodies or letting revisions of an active company hide another holding. */
export async function loadLatestPortfolioResearchRows(table: 'equity_research_notes' | 'etf_research_notes', ownerId: string, candidateSymbols: string[]): Promise<ResearchRow[]> {
  const supabase = getSupabaseClient()
  if (!supabase) throw new Error('Portfolio research coverage requires database access')
  const latestIds: string[] = []
  const trackedSymbols = [...new Set(candidateSymbols)]
  for (let start = 0; start < trackedSymbols.length; start += 100) {
    const batch = trackedSymbols.slice(start, start + 100)
    const latestBySymbol = new Map<string, string>()
    for (let offset = 0; ; offset += 500) {
      const result = await supabase.from(table).select('id,symbol')
        .eq('owner_id', ownerId).in('symbol', batch)
        .order('generated_at', { ascending: false }).order('id').range(offset, offset + 499)
      if (result.error) throw new Error(`Unable to read latest portfolio research: ${result.error.message}`)
      for (const row of result.data ?? []) if (!latestBySymbol.has(row.symbol)) latestBySymbol.set(row.symbol, row.id)
      if ((result.data?.length ?? 0) < 500 || latestBySymbol.size === batch.length) break
    }
    latestIds.push(...latestBySymbol.values())
  }
  const reports: ResearchRow[] = []
  for (let start = 0; start < latestIds.length; start += 100) {
    const result = await supabase.from(table).select('id,symbol,status,generated_at,content')
      .eq('owner_id', ownerId).in('id', latestIds.slice(start, start + 100))
    if (result.error) throw new Error(`Unable to validate portfolio research content: ${result.error.message}`)
    reports.push(...(result.data ?? []) as ResearchRow[])
  }
  return reports
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
  researchBySymbol: ReadonlyMap<string, Pick<ResearchRow, 'status' | 'generated_at' | 'research_contract_version' | 'content'>>
  availableSymbols: ReadonlySet<string>
  fundSymbols?: ReadonlySet<string>
  now?: Date
  maxTargets?: number
}): PortfolioResearchCoverage {
  const now = input.now ?? new Date()
  const ownedSymbols = [...new Set([...input.ownedSymbols].map((symbol) => symbol.toUpperCase()))]
    .sort()
  const ownedSet = new Set(ownedSymbols)
  const watchlistedSymbols = [...new Set([...input.watchlistedSymbols].map((symbol) => symbol.toUpperCase()))]
    .filter((symbol) => input.availableSymbols.has(symbol) && !ownedSet.has(symbol)).sort()
  const tracked = new Set([...ownedSymbols, ...watchlistedSymbols])
  const relatedToByPeer = new Map<string, string[]>()
  for (const symbol of ownedSymbols) {
    for (const peer of input.peerSymbolsByOwnedSymbol.get(symbol) ?? []) {
      const normalized = peer.toUpperCase()
      if (!input.availableSymbols.has(normalized) || input.fundSymbols?.has(normalized) || tracked.has(normalized)) continue
      relatedToByPeer.set(normalized, [...new Set([...(relatedToByPeer.get(normalized) ?? []), symbol])])
    }
  }
  const adjacentSymbols = [...relatedToByPeer.keys()].sort((left, right) => {
    const difference = (relatedToByPeer.get(right)?.length ?? 0) - (relatedToByPeer.get(left)?.length ?? 0)
    return difference || left.localeCompare(right)
  })
  const staleAfter = now.getTime() - 35 * 24 * 60 * 60 * 1_000
  const current = (research: Pick<ResearchRow, 'status' | 'generated_at' | 'content'>) => research.status === 'complete' && hasCurrentResearchContract(research.content) && Number.isFinite(Date.parse(research.generated_at)) && Date.parse(research.generated_at) <= now.getTime() && Date.parse(research.generated_at) >= staleAfter
  const needsResearch = (symbol: string) => {
    const research = input.researchBySymbol.get(symbol)
    if (!research) return true
    if (research.status === 'queued' || research.status === 'running') return false
    return !current(research)
  }
  const candidates: PortfolioResearchTarget[] = [
    ...ownedSymbols.map((symbol) => ({ symbol, priority: 'owned' as const, reason: 'portfolio-owned-preemptive', relatedTo: [] })),
    ...watchlistedSymbols.map((symbol) => ({ symbol, priority: 'watchlisted' as const, reason: 'portfolio-watchlist-preemptive', relatedTo: [] })),
    ...adjacentSymbols.map((symbol) => ({ symbol, priority: 'adjacent' as const, reason: 'portfolio-adjacent-preemptive', relatedTo: relatedToByPeer.get(symbol) ?? [] })),
  ]
  const targets = candidates.filter((candidate) => input.availableSymbols.has(candidate.symbol) && needsResearch(candidate.symbol)).slice(0, input.maxTargets ?? 4).map(target=>({...target,instrumentType:input.fundSymbols?.has(target.symbol)?'etf' as const:'equity' as const}))
  const coveredSymbols = [...input.researchBySymbol.entries()]
    .filter(([, research]) => current(research))
    .map(([symbol]) => symbol)
  const queuedSymbols = [...input.researchBySymbol.entries()]
    .filter(([, research]) => research.status === 'queued' || research.status === 'running')
    .map(([symbol]) => symbol)
  return { ownedSymbols, watchlistedSymbols, adjacentSymbols, coveredSymbols, queuedSymbols, targets, unavailableSymbols:ownedSymbols.filter(symbol=>!input.availableSymbols.has(symbol)) }
}

export async function fetchPortfolioResearchCoverage(ownerId: string, options: { now?: Date; maxTargets?: number } = {}): Promise<PortfolioResearchCoverage> {
  const supabase = getSupabaseClient()
  if (!supabase) throw new Error('Portfolio research coverage requires database access')
  const [portfolios, watchlistsResult] = await Promise.all([
    fetchAuthoritativePortfolios(ownerId),
    supabase.from('market_watchlist_items').select('symbol,market_watchlists!inner(owner_id)').eq('market_watchlists.owner_id', ownerId),
  ])
  const error = watchlistsResult.error
  if (error) throw new Error(`Unable to build portfolio research coverage: ${error.message}`)
  const shares = new Map<string, number>()
  for (const portfolio of portfolios) for (const holding of portfolio.holdings) shares.set(holding.symbol, (shares.get(holding.symbol) ?? 0) + holding.quantity)
  const ownedSymbols = [...shares].flatMap(([symbol, quantity]) => quantity > 0 ? [symbol] : [])
  const latestPacketBySymbol = new Map<string, string>()
  if (ownedSymbols.length) {
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await supabase.from('company_packets').select('id,symbol')
        .eq('owner_id', ownerId).in('symbol', ownedSymbols).eq('status', 'complete')
        .order('generated_at', { ascending: false }).order('id').range(offset, offset + 499)
      if (error) throw new Error(`Unable to read research peers: ${error.message}`)
      for (const row of data ?? []) if (!latestPacketBySymbol.has(row.symbol)) latestPacketBySymbol.set(row.symbol, row.id)
      if ((data?.length ?? 0) < 500 || latestPacketBySymbol.size === ownedSymbols.length) break
    }
  }
  const packetsResult = latestPacketBySymbol.size
    ? await supabase.from('company_packets').select('symbol,peers:packet->peers')
      .eq('owner_id', ownerId).in('id', [...latestPacketBySymbol.values()])
    : { data: [], error: null }
  if (packetsResult.error) throw new Error(`Unable to read research peers: ${packetsResult.error.message}`)
  const watchlistedSymbols = (watchlistsResult.data ?? []).flatMap((row) => {
    const item = row as WatchlistRow
    return watchlistOwner(item) === ownerId ? [item.symbol] : []
  })
  const peerSymbolsByOwnedSymbol = new Map<string, string[]>()
  for (const row of (packetsResult.data ?? []) as unknown as PacketRow[]) {
    if (!shares.has(row.symbol) || (shares.get(row.symbol) ?? 0) <= 0.00000001 || peerSymbolsByOwnedSymbol.has(row.symbol)) continue
    peerSymbolsByOwnedSymbol.set(row.symbol, symbols(row.peers))
  }
  const allCandidates = [...new Set([...ownedSymbols, ...watchlistedSymbols, ...[...peerSymbolsByOwnedSymbol.values()].flat()])]
  const [research, fundResearch, { data: assets, error: assetError }, { ETF_SOURCES }] = await Promise.all([
    loadLatestPortfolioResearchRows('equity_research_notes', ownerId, allCandidates),
    loadLatestPortfolioResearchRows('etf_research_notes', ownerId, allCandidates),
    allCandidates.length > 0 ? supabase.from('market_assets').select('symbol,name').in('symbol', allCandidates) : Promise.resolve({ data: [], error: null }),
    import('./etf-research.ts'),
  ])
  if (assetError) throw new Error(`Unable to verify portfolio research symbols: ${assetError.message}`)
  const researchBySymbol = latestStatusBySymbol([...research, ...fundResearch])
  return buildPortfolioResearchCoverage({
    ownedSymbols,
    watchlistedSymbols,
    peerSymbolsByOwnedSymbol,
    researchBySymbol,
    availableSymbols: new Set((assets ?? []).map(row=>String(row.symbol))),
    fundSymbols: new Set((assets ?? []).flatMap(row=>ETF_SOURCES[String(row.symbol)] || /\b(?:ETF|index fund|exchange[- ]traded fund)\b/i.test(String(row.name ?? ''))?[String(row.symbol)]:[])),
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

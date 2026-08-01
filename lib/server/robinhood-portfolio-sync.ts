import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client'

import { getSupabaseClient } from './supabase.ts'

const DEFAULT_ROBINHOOD_MCP_URL = 'https://agent.robinhood.com/mcp/trading'

export type RobinhoodSyncSlot = 'open' | 'midday' | 'close' | 'final'

export interface RobinhoodPortfolioSyncConfig {
  ownerId: string
  portfolioName: string
  accountNumber: string
  accessToken: string
  mcpUrl: string
}

export interface RobinhoodPositionSnapshot {
  symbol: string
  quantity: number
  costBasisPerShare: number
  currentPrice: number | null
  quoteAsOf: string | null
}

export interface RobinhoodPortfolioSnapshot {
  capturedAt: string
  cashBalance: number
  equityValue: number
  totalValue: number
  buyingPower: number | null
  currency: string
  positions: RobinhoodPositionSnapshot[]
}

function numberOrNull(value: unknown): number | null {
  if (typeof value !== 'number' && typeof value !== 'string') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function toolData(response: unknown): Record<string, unknown> {
  const responseRecord = record(response)
  const structured = record(responseRecord?.structuredContent)
  const data = record(structured?.data)
  if (!data) throw new Error('Robinhood MCP returned an invalid tool response')
  return data
}

function laterQuote(
  current: { price: number, asOf: string } | null,
  price: unknown,
  asOf: unknown,
): { price: number, asOf: string } | null {
  const parsedPrice = numberOrNull(price)
  const parsedAt = typeof asOf === 'string' && Number.isFinite(Date.parse(asOf)) ? asOf : null
  if (parsedPrice === null || !parsedAt) return current
  if (!current || Date.parse(parsedAt) > Date.parse(current.asOf)) return { price: parsedPrice, asOf: parsedAt }
  return current
}

export function normalizeRobinhoodPortfolioSnapshot(
  positionsResponse: unknown,
  portfolioResponse: unknown,
  quotesResponse: unknown,
  capturedAt = new Date().toISOString(),
): RobinhoodPortfolioSnapshot {
  const positionsData = toolData(positionsResponse)
  const portfolioData = toolData(portfolioResponse)
  const quotesData = toolData(quotesResponse)
  const quotesBySymbol = new Map<string, { price: number, asOf: string }>()

  for (const item of Array.isArray(quotesData.results) ? quotesData.results : []) {
    const quote = record(record(item)?.quote)
    const symbol = typeof quote?.symbol === 'string' ? quote.symbol.toUpperCase() : ''
    if (!symbol || quote?.has_traded === false) continue
    let latest = laterQuote(null, quote?.last_trade_price, quote?.venue_last_trade_time)
    latest = laterQuote(latest, quote?.last_non_reg_trade_price, quote?.venue_last_non_reg_trade_time)
    if (latest) quotesBySymbol.set(symbol, latest)
  }

  const positions: RobinhoodPositionSnapshot[] = []
  for (const item of Array.isArray(positionsData.positions) ? positionsData.positions : []) {
    const position = record(item)
    const symbol = typeof position?.symbol === 'string' ? position.symbol.toUpperCase() : ''
    const quantity = numberOrNull(position?.quantity)
    const costBasisPerShare = numberOrNull(position?.average_buy_price)
    if (!symbol || quantity === null || quantity <= 0 || costBasisPerShare === null || costBasisPerShare < 0) continue
    const quote = quotesBySymbol.get(symbol)
    positions.push({
      symbol,
      quantity,
      costBasisPerShare,
      currentPrice: quote?.price ?? null,
      quoteAsOf: quote?.asOf ?? null,
    })
  }

  const cashBalance = numberOrNull(portfolioData.cash)
  const equityValue = numberOrNull(portfolioData.equity_value)
  const totalValue = numberOrNull(portfolioData.total_value)
  if (cashBalance === null || equityValue === null || totalValue === null) {
    throw new Error('Robinhood MCP portfolio response is missing account valuation fields')
  }
  const buyingPower = numberOrNull(record(portfolioData.buying_power)?.buying_power)
  const currency = typeof portfolioData.currency === 'string' ? portfolioData.currency : 'USD'
  return { capturedAt, cashBalance, equityValue, totalValue, buyingPower, currency, positions }
}

export function getRobinhoodPortfolioSyncConfig(env: NodeJS.ProcessEnv = process.env): RobinhoodPortfolioSyncConfig | null {
  if (env.ROBINHOOD_SYNC_ENABLED !== 'true') return null
  const ownerId = env.ROBINHOOD_PORTFOLIO_OWNER_ID?.trim() ?? ''
  const accountNumber = env.ROBINHOOD_ACCOUNT_NUMBER?.trim() ?? ''
  const accessToken = env.ROBINHOOD_MCP_ACCESS_TOKEN?.trim() ?? ''
  if (!ownerId || !accountNumber || !accessToken) return null
  return {
    ownerId,
    portfolioName: env.ROBINHOOD_PORTFOLIO_NAME?.trim() || 'Personal',
    accountNumber,
    accessToken,
    mcpUrl: env.ROBINHOOD_MCP_URL?.trim() || DEFAULT_ROBINHOOD_MCP_URL,
  }
}

export function isRobinhoodPortfolioSyncConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return getRobinhoodPortfolioSyncConfig(env) !== null
}

async function loadRobinhoodSnapshot(config: RobinhoodPortfolioSyncConfig): Promise<RobinhoodPortfolioSnapshot> {
  const client = new Client({ name: 'stratum-private-portfolio-sync', version: '1.0.0' })
  const transport = new StreamableHTTPClientTransport(new URL(config.mcpUrl), {
    authProvider: { token: async () => config.accessToken },
    requestInit: { signal: AbortSignal.timeout(30_000) },
  })
  try {
    await client.connect(transport)
    const [positionsResponse, portfolioResponse] = await Promise.all([
      client.callTool({ name: 'get_equity_positions', arguments: { account_number: config.accountNumber } }),
      client.callTool({ name: 'get_portfolio', arguments: { account_number: config.accountNumber } }),
    ])
    const positionData = toolData(positionsResponse)
    const symbols = (Array.isArray(positionData.positions) ? positionData.positions : [])
      .map((value) => record(value)?.symbol)
      .filter((symbol): symbol is string => typeof symbol === 'string' && /^[A-Za-z][A-Za-z0-9.-]{0,11}$/.test(symbol))
      .map((symbol) => symbol.toUpperCase())
    const quoteResponses = await Promise.all(Array.from({ length: Math.ceil(symbols.length / 20) }, (_, index) => {
      const batch = symbols.slice(index * 20, index * 20 + 20)
      return client.callTool({ name: 'get_equity_quotes', arguments: { symbols: batch } })
    }))
    const quotesResponse = {
      structuredContent: {
        data: {
          results: quoteResponses.flatMap((response) => {
            const data = toolData(response)
            return Array.isArray(data.results) ? data.results : []
          }),
        },
      },
    }
    return normalizeRobinhoodPortfolioSnapshot(positionsResponse, portfolioResponse, quotesResponse)
  } finally {
    await client.close().catch(() => undefined)
  }
}

export async function syncRobinhoodPortfolio(
  config = getRobinhoodPortfolioSyncConfig(),
  slot: RobinhoodSyncSlot | null = null,
): Promise<{ runId: string, positionCount: number, capturedAt: string }> {
  if (!config) throw new Error('Robinhood portfolio sync is not configured on this worker')
  const supabase = getSupabaseClient()
  if (!supabase) throw new Error('Supabase service credentials are not configured')
  const { data: portfolio, error: portfolioError } = await supabase
    .from('portfolios')
    .select('id')
    .eq('owner_id', config.ownerId)
    .eq('name', config.portfolioName)
    .eq('kind', 'brokerage')
    .maybeSingle()
  if (portfolioError || !portfolio) throw new Error(`Unable to resolve the Robinhood portfolio: ${portfolioError?.message ?? config.portfolioName}`)

  const accountLast4 = config.accountNumber.slice(-4)
  const { data: run, error: runError } = await supabase
    .from('brokerage_sync_runs')
    .insert({
      owner_id: config.ownerId,
      portfolio_id: portfolio.id,
      provider: 'robinhood',
      status: 'running',
      slot,
      account_last4: accountLast4,
      source_metadata: { transport: 'mcp', scope: 'private_portfolio' },
    })
    .select('id')
    .single()
  if (runError || !run) throw new Error(`Unable to start Robinhood sync: ${runError?.message ?? 'unknown error'}`)

  try {
    const snapshot = await loadRobinhoodSnapshot(config)
    const { error: accountError } = await supabase.from('brokerage_account_snapshots').insert({
      sync_run_id: run.id,
      cash_balance: snapshot.cashBalance,
      equity_value: snapshot.equityValue,
      total_value: snapshot.totalValue,
      buying_power: snapshot.buyingPower,
      currency: snapshot.currency,
    })
    if (accountError) throw new Error(`Unable to persist Robinhood account snapshot: ${accountError.message}`)
    if (snapshot.positions.length > 0) {
      const { error: positionsError } = await supabase.from('brokerage_position_snapshots').insert(snapshot.positions.map((position) => ({
        sync_run_id: run.id,
        symbol: position.symbol,
        quantity: position.quantity,
        cost_basis_per_share: position.costBasisPerShare,
        current_price: position.currentPrice,
        quote_as_of: position.quoteAsOf,
        quote_source: 'robinhood_mcp',
      })))
      if (positionsError) throw new Error(`Unable to persist Robinhood position snapshots: ${positionsError.message}`)
    }
    const { error: completeError } = await supabase.from('brokerage_sync_runs').update({
      status: 'succeeded',
      captured_at: snapshot.capturedAt,
      completed_at: new Date().toISOString(),
      position_count: snapshot.positions.length,
    }).eq('id', run.id)
    if (completeError) throw new Error(`Unable to complete Robinhood sync: ${completeError.message}`)
    return { runId: run.id, positionCount: snapshot.positions.length, capturedAt: snapshot.capturedAt }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await supabase.from('brokerage_sync_runs').update({
      status: 'failed', error: message, completed_at: new Date().toISOString(),
    }).eq('id', run.id)
    throw error
  }
}

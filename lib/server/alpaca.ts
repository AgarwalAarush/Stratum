import type { MarketAsset, MarketDailyBar, MarketFeed, MarketSnapshot } from '../markets/types.ts'

const DEFAULT_DATA_URL = 'https://data.alpaca.markets'
const DEFAULT_TRADING_URL = 'https://api.alpaca.markets'
const DEFAULT_TIMEOUT_MS = 12_000
const DEFAULT_MAX_ATTEMPTS = 3
const SYMBOL_BATCH_SIZE = 100
const SNAPSHOT_BATCH_CONCURRENCY = 4

type AlpacaFeed = Exclude<MarketFeed, 'illustrative'>

interface AlpacaAssetPayload {
  symbol?: string
  name?: string
  exchange?: string
  class?: string
  status?: string
  tradable?: boolean
}

interface AlpacaBarPayload {
  t?: string
  o?: number
  h?: number
  l?: number
  c?: number
  v?: number
  n?: number
  vw?: number
}

interface AlpacaSnapshotPayload {
  latestTrade?: { p?: number; t?: string }
  dailyBar?: AlpacaBarPayload
  prevDailyBar?: AlpacaBarPayload
}

interface AlpacaBarsResponse {
  bars?: Record<string, AlpacaBarPayload[]>
  next_page_token?: string | null
}

type AlpacaSnapshotsResponse = Record<string, AlpacaSnapshotPayload> | {
  snapshots: Record<string, AlpacaSnapshotPayload>
}

interface AlpacaClockResponse {
  timestamp?: string
  is_open?: boolean
  next_open?: string
  next_close?: string
}

function normalizeAsset(asset: AlpacaAssetPayload): MarketAsset | null {
  if (!asset.symbol || !asset.name || !asset.exchange || asset.class !== 'us_equity') return null
  return {
    symbol: asset.symbol,
    name: asset.name,
    exchange: asset.exchange,
    assetClass: 'us_equity',
    tradable: asset.tradable === true,
    active: asset.status === 'active',
  }
}

export interface AlpacaMarketClock {
  timestamp: string
  isOpen: boolean
  nextOpen: string
  nextClose: string
}

export interface AlpacaResult<T> {
  data: T
  feed: AlpacaFeed
}

export interface AlpacaClientOptions {
  keyId: string
  secretKey: string
  feed?: AlpacaFeed
  dataUrl?: string
  tradingUrl?: string
  timeoutMs?: number
  maxAttempts?: number
  fetchImpl?: typeof fetch
  wait?: (milliseconds: number) => Promise<void>
}

export class AlpacaRequestError extends Error {
  readonly status: number
  readonly retryAfterSeconds: number | null

  constructor(
    message: string,
    status: number,
    retryAfterSeconds: number | null,
  ) {
    super(message)
    this.name = 'AlpacaRequestError'
    this.status = status
    this.retryAfterSeconds = retryAfterSeconds
  }
}

function splitIntoBatches<T>(items: T[], batchSize = SYMBOL_BATCH_SIZE): T[][] {
  const batches: T[][] = []
  for (let index = 0; index < items.length; index += batchSize) batches.push(items.slice(index, index + batchSize))
  return batches
}

async function mapWithConcurrency<T, Result>(
  items: T[],
  limit: number,
  operation: (item: T) => Promise<Result>,
): Promise<Result[]> {
  const results = new Array<Result>(items.length)
  let nextIndex = 0
  const worker = async () => {
    while (true) {
      const index = nextIndex
      nextIndex += 1
      if (index >= items.length) return
      results[index] = await operation(items[index]!)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function isFeedEntitlementError(error: unknown): boolean {
  return error instanceof AlpacaRequestError && (error.status === 403 || error.status === 422)
}

function defaultWait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

export class AlpacaClient {
  private readonly keyId: string
  private readonly secretKey: string
  private readonly preferredFeed: AlpacaFeed
  private readonly dataUrl: string
  private readonly tradingUrl: string
  private readonly timeoutMs: number
  private readonly maxAttempts: number
  private readonly fetchImpl: typeof fetch
  private readonly wait: (milliseconds: number) => Promise<void>

  constructor(options: AlpacaClientOptions) {
    this.keyId = options.keyId
    this.secretKey = options.secretKey
    this.preferredFeed = options.feed ?? 'delayed_sip'
    this.dataUrl = options.dataUrl ?? DEFAULT_DATA_URL
    this.tradingUrl = options.tradingUrl ?? DEFAULT_TRADING_URL
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
    this.maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS
    this.fetchImpl = options.fetchImpl ?? fetch
    this.wait = options.wait ?? defaultWait
  }

  private async requestJson<T>(baseUrl: string, path: string, parameters?: URLSearchParams): Promise<T> {
    const url = new URL(path, baseUrl)
    if (parameters) url.search = parameters.toString()

    for (let attempt = 1; attempt <= this.maxAttempts; attempt += 1) {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), this.timeoutMs)

      try {
        const response = await this.fetchImpl(url, {
          headers: {
            Accept: 'application/json',
            'APCA-API-KEY-ID': this.keyId,
            'APCA-API-SECRET-KEY': this.secretKey,
            'User-Agent': 'Stratum Markets/0.1',
          },
          signal: controller.signal,
        })

        if (response.ok) return await response.json() as T

        const retryAfterHeader = response.headers.get('retry-after')
        const retryAfterSeconds = retryAfterHeader ? Number.parseFloat(retryAfterHeader) : null
        const body = await response.text()
        const error = new AlpacaRequestError(
          `Alpaca request failed (${response.status}): ${body.slice(0, 240) || response.statusText}`,
          response.status,
          Number.isFinite(retryAfterSeconds) ? retryAfterSeconds : null,
        )

        const transient = response.status === 429 || response.status >= 500
        if (!transient || attempt === this.maxAttempts) throw error

        const backoff = error.retryAfterSeconds === null
          ? Math.min(2_000, 200 * (2 ** (attempt - 1)))
          : Math.max(0, error.retryAfterSeconds * 1_000)
        await this.wait(backoff)
      } catch (error) {
        if (error instanceof AlpacaRequestError) throw error
        if (attempt === this.maxAttempts) throw error
        await this.wait(Math.min(2_000, 200 * (2 ** (attempt - 1))))
      } finally {
        clearTimeout(timeout)
      }
    }

    throw new Error('Alpaca request exhausted without a response')
  }

  private async withFeedFallback<T>(operation: (feed: AlpacaFeed) => Promise<T>, requestedFeed = this.preferredFeed): Promise<AlpacaResult<T>> {
    try {
      return { data: await operation(requestedFeed), feed: requestedFeed }
    } catch (error) {
      if (requestedFeed === 'iex' || !isFeedEntitlementError(error)) throw error
      return { data: await operation('iex'), feed: 'iex' }
    }
  }

  async fetchAssets(): Promise<MarketAsset[]> {
    const parameters = new URLSearchParams({ status: 'active', asset_class: 'us_equity' })
    const payload = await this.requestJson<AlpacaAssetPayload[]>(this.tradingUrl, '/v2/assets', parameters)

    return payload.flatMap((asset) => {
      const normalized = normalizeAsset(asset)
      return normalized ? [normalized] : []
    })
  }

  /** Fetches one requested US equity for watchlist coverage without a full asset-catalog sync. */
  async fetchAsset(symbolInput: string): Promise<MarketAsset | null> {
    const symbol = symbolInput.trim().toUpperCase()
    if (!/^[A-Z][A-Z0-9.-]{0,11}$/.test(symbol)) return null
    try {
      const payload = await this.requestJson<AlpacaAssetPayload>(this.tradingUrl, `/v2/assets/${encodeURIComponent(symbol)}`)
      return normalizeAsset(payload)
    } catch (error) {
      if (error instanceof AlpacaRequestError && error.status === 404) return null
      throw error
    }
  }

  async fetchClock(): Promise<AlpacaMarketClock> {
    const clock = await this.requestJson<AlpacaClockResponse>(this.tradingUrl, '/v2/clock')
    if (!clock.timestamp || typeof clock.is_open !== 'boolean' || !clock.next_open || !clock.next_close) {
      throw new Error('Alpaca market clock response is incomplete')
    }
    return {
      timestamp: clock.timestamp,
      isOpen: clock.is_open,
      nextOpen: clock.next_open,
      nextClose: clock.next_close,
    }
  }

  async fetchSnapshots(symbols: string[], requestedFeed = this.preferredFeed): Promise<AlpacaResult<MarketSnapshot[]>> {
    if (symbols.length === 0) return { data: [], feed: requestedFeed }

    return this.withFeedFallback(async (feed) => {
      const snapshotBatches = await mapWithConcurrency(
        splitIntoBatches(symbols),
        SNAPSHOT_BATCH_CONCURRENCY,
        async (batch) => {
        const parameters = new URLSearchParams({ symbols: batch.join(','), feed })
        const payload = await this.requestJson<AlpacaSnapshotsResponse>(this.dataUrl, '/v2/stocks/snapshots', parameters)
        const snapshotMap: Record<string, AlpacaSnapshotPayload> = 'snapshots' in payload
          ? (payload as { snapshots: Record<string, AlpacaSnapshotPayload> }).snapshots
          : payload as Record<string, AlpacaSnapshotPayload>

        return batch.flatMap((symbol) => {
          const snapshot = snapshotMap[symbol]
          if (!snapshot) return []
          const price = finiteNumber(snapshot.latestTrade?.p) ?? finiteNumber(snapshot.dailyBar?.c)
          const previousClose = finiteNumber(snapshot.prevDailyBar?.c)
          const open = finiteNumber(snapshot.dailyBar?.o)
          const high = finiteNumber(snapshot.dailyBar?.h)
          const low = finiteNumber(snapshot.dailyBar?.l)
          const volume = finiteNumber(snapshot.dailyBar?.v)
          const asOf = snapshot.latestTrade?.t ?? snapshot.dailyBar?.t
          if ([price, previousClose, open, high, low, volume].some((value) => value === null) || !asOf) return []

          return [{
            symbol,
            price: price as number,
            previousClose: previousClose as number,
            open: open as number,
            high: high as number,
            low: low as number,
            volume: volume as number,
            asOf,
            feed,
          }]
        })
        },
      )
      return snapshotBatches.flat()
    }, requestedFeed)
  }

  async fetchDailyBars(
    symbols: string[],
    start: string,
    end: string,
    requestedFeed = this.preferredFeed,
  ): Promise<AlpacaResult<MarketDailyBar[]>> {
    if (symbols.length === 0) return { data: [], feed: requestedFeed }

    return this.withFeedFallback(async (feed) => {
      const bars: MarketDailyBar[] = []
      const historicalFeed = feed === 'delayed_sip' ? 'sip' : feed
      for (const batch of splitIntoBatches(symbols)) {
        let pageToken: string | null = null
        do {
          const parameters = new URLSearchParams({
            symbols: batch.join(','),
            timeframe: '1Day',
            start,
            end,
            adjustment: 'all',
            feed: historicalFeed,
            limit: '10000',
          })
          if (pageToken) parameters.set('page_token', pageToken)
          const payload = await this.requestJson<AlpacaBarsResponse>(this.dataUrl, '/v2/stocks/bars', parameters)

          for (const symbol of batch) {
            for (const bar of payload.bars?.[symbol] ?? []) {
              const open = finiteNumber(bar.o)
              const high = finiteNumber(bar.h)
              const low = finiteNumber(bar.l)
              const close = finiteNumber(bar.c)
              const volume = finiteNumber(bar.v)
              if (!bar.t || [open, high, low, close, volume].some((value) => value === null)) continue
              bars.push({
                symbol,
                tradingDate: bar.t.slice(0, 10),
                open: open as number,
                high: high as number,
                low: low as number,
                close: close as number,
                volume: volume as number,
                tradeCount: finiteNumber(bar.n),
                vwap: finiteNumber(bar.vw),
                feed,
                asOf: bar.t,
              })
            }
          }
          pageToken = payload.next_page_token ?? null
        } while (pageToken)
      }
      return bars
    }, requestedFeed)
  }
}

export function getAlpacaClient(
  environment: NodeJS.ProcessEnv = process.env,
  fetchImpl: typeof fetch = fetch,
): AlpacaClient | null {
  const keyId = environment.ALPACA_API_KEY_ID
  const secretKey = environment.ALPACA_API_SECRET_KEY
  if (!keyId || !secretKey) return null

  const configuredFeed = environment.ALPACA_DATA_FEED
  const feed: AlpacaFeed = configuredFeed === 'sip' || configuredFeed === 'iex' || configuredFeed === 'delayed_sip'
    ? configuredFeed
    : 'delayed_sip'

  return new AlpacaClient({
    keyId,
    secretKey,
    feed,
    dataUrl: environment.ALPACA_DATA_URL,
    tradingUrl: environment.ALPACA_TRADING_URL,
    fetchImpl,
  })
}

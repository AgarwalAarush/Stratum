export interface FmpRequestOptions {
  apiKey: string
  fetchImpl?: typeof fetch
  baseUrl?: string
  timeoutMs?: number
  maxAttempts?: number
  wait?: (milliseconds: number) => Promise<void>
}

export interface FmpUsageSnapshot {
  totalRequests: number
  responseBytes: number
  throttledRequests: number
  windowRequests: number
  activeRequests: number
  queuedRequests: number
  statusCounts: Record<string, number>
}

interface PendingRequest<T> {
  operation: () => Promise<T>
  resolve: (value: T | PromiseLike<T>) => void
  reject: (reason?: unknown) => void
  throttled: boolean
}

export class FmpRequestGovernor {
  private readonly maximumRequests: number
  private readonly maximumConcurrent: number
  private readonly windowMs: number
  private readonly now: () => number
  private readonly queue: Array<PendingRequest<unknown>> = []
  private readonly starts: number[] = []
  private readonly statuses = new Map<string, number>()
  private active = 0
  private timer: ReturnType<typeof setTimeout> | null = null
  private total = 0
  private bytes = 0
  private throttled = 0

  constructor(options: {
    maximumRequests?: number
    maximumConcurrent?: number
    windowMs?: number
    now?: () => number
  } = {}) {
    this.maximumRequests = Math.max(1, options.maximumRequests ?? 240)
    this.maximumConcurrent = Math.max(1, options.maximumConcurrent ?? 8)
    this.windowMs = Math.max(1, options.windowMs ?? 60_000)
    this.now = options.now ?? Date.now
  }

  run<T>(operation: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push({ operation, resolve, reject, throttled: false } as PendingRequest<unknown>)
      this.drain()
    })
  }

  recordResponse(status: number, bytes: number): void {
    const key = String(status)
    this.statuses.set(key, (this.statuses.get(key) ?? 0) + 1)
    this.bytes += Math.max(0, bytes)
  }

  snapshot(): FmpUsageSnapshot {
    this.prune(this.now())
    return {
      totalRequests: this.total,
      responseBytes: this.bytes,
      throttledRequests: this.throttled,
      windowRequests: this.starts.length,
      activeRequests: this.active,
      queuedRequests: this.queue.length,
      statusCounts: Object.fromEntries(this.statuses),
    }
  }

  private prune(now: number): void {
    while (this.starts.length > 0 && this.starts[0]! <= now - this.windowMs) this.starts.shift()
  }

  private schedule(delayMs: number): void {
    if (this.timer) return
    this.timer = setTimeout(() => {
      this.timer = null
      this.drain()
    }, Math.max(1, delayMs))
  }

  private drain(): void {
    const now = this.now()
    this.prune(now)
    while (this.active < this.maximumConcurrent && this.queue.length > 0) {
      if (this.starts.length >= this.maximumRequests) {
        const next = this.queue[0]!
        if (!next.throttled) {
          next.throttled = true
          this.throttled += 1
        }
        this.schedule(this.starts[0]! + this.windowMs - now)
        return
      }

      const pending = this.queue.shift()!
      this.active += 1
      this.total += 1
      this.starts.push(this.now())
      void pending.operation().then(pending.resolve, pending.reject).finally(() => {
        this.active -= 1
        this.drain()
      })
    }
  }
}

function environmentInteger(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? '', 10)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

const fmpGovernor = new FmpRequestGovernor({
  maximumRequests: environmentInteger(process.env.FMP_REQUESTS_PER_MINUTE, 240),
  maximumConcurrent: environmentInteger(process.env.FMP_MAX_CONCURRENCY, 8),
})

export function getFmpUsageSnapshot(): FmpUsageSnapshot {
  return fmpGovernor.snapshot()
}

export class FmpRequestError extends Error {
  readonly status: number
  readonly endpoint: string

  constructor(status: number, endpoint: string) {
    super(`FMP request failed (${status}) for ${endpoint}`)
    this.name = 'FmpRequestError'
    this.status = status
    this.endpoint = endpoint
  }
}

export async function fetchFmpStableJson<T>(
  endpoint: string,
  parameters: Record<string, string | number | boolean | undefined>,
  options: FmpRequestOptions,
): Promise<T> {
  const normalizedEndpoint = endpoint.replace(/^\/+/, '')
  const url = new URL(normalizedEndpoint, options.baseUrl ?? 'https://financialmodelingprep.com/stable/')

  for (const [key, value] of Object.entries(parameters)) {
    if (value !== undefined) url.searchParams.set(key, String(value))
  }
  url.searchParams.set('apikey', options.apiKey)

  const maximumAttempts = Math.max(1, options.maxAttempts ?? 3)
  const wait = options.wait ?? ((milliseconds: number) =>
    new Promise<void>((resolve) => setTimeout(resolve, milliseconds)))
  for (let attempt = 1; attempt <= maximumAttempts; attempt += 1) {
    try {
      return await fmpGovernor.run(async () => {
        const response = await (options.fetchImpl ?? fetch)(url, {
          signal: AbortSignal.timeout(options.timeoutMs ?? 12_000),
          headers: {
            Accept: 'application/json',
            'User-Agent': 'Stratum/0.3 (+market-intelligence-worker)',
          },
        })
        const body = await response.text()
        fmpGovernor.recordResponse(response.status, new TextEncoder().encode(body).byteLength)
        if (!response.ok) throw new FmpRequestError(response.status, normalizedEndpoint)
        return JSON.parse(body) as T
      })
    } catch (error) {
      const retryable = !(error instanceof FmpRequestError)
        || error.status === 429
        || error.status >= 500
      if (!retryable || attempt === maximumAttempts) throw error
      await wait(Math.min(2_000, 200 * (2 ** (attempt - 1))))
    }
  }
  throw new Error(`FMP request exhausted for ${normalizedEndpoint}`)
}

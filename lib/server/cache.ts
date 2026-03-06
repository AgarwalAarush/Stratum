type CacheSource = 'memory' | 'redis' | 'fresh' | 'stale' | 'none'

const REDIS_OP_TIMEOUT_MS = 1_500
const NEG_SENTINEL = '__STRATUM_NEG__'

interface MemoryEntry {
  value: unknown
  expiresAt: number
}

interface StaleEntry {
  value: unknown
  updatedAt: number
}

interface CacheRead {
  value: unknown
  source: 'memory' | 'redis'
}

export interface CachedFetchOptions<T> {
  key: string
  ttlSeconds: number
  fetcher: () => Promise<T | null>
  negativeTtlSeconds?: number
  staleMaxAgeMs?: number
}

export interface CachedFetchResult<T> {
  data: T | null
  source: CacheSource
}

const memoryCache = new Map<string, MemoryEntry>()
const staleCache = new Map<string, StaleEntry>()
const inflight = new Map<string, Promise<CachedFetchResult<unknown>>>()

function nowMs(): number {
  return Date.now()
}

function isExpired(entry: MemoryEntry): boolean {
  return entry.expiresAt <= nowMs()
}

function getRedisConfig():
  | { url: string; token: string }
  | null {
  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN

  if (!url || !token) return null
  return { url, token }
}

function setMemoryValue(key: string, value: unknown, ttlSeconds: number): void {
  memoryCache.set(key, {
    value,
    expiresAt: nowMs() + ttlSeconds * 1_000,
  })
}

function setStaleValue(key: string, value: unknown): void {
  staleCache.set(key, { value, updatedAt: nowMs() })
}

function getFreshMemoryValue(key: string): unknown | null {
  const entry = memoryCache.get(key)
  if (!entry) return null
  if (isExpired(entry)) {
    memoryCache.delete(key)
    return null
  }
  return entry.value
}

async function getRedisValue(key: string): Promise<unknown | null> {
  const redis = getRedisConfig()
  if (!redis) return null

  try {
    const response = await fetch(`${redis.url}/get/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${redis.token}` },
      signal: AbortSignal.timeout(REDIS_OP_TIMEOUT_MS),
    })

    if (!response.ok) return null
    const data = (await response.json()) as { result?: string | null }
    if (!data.result) return null

    return JSON.parse(data.result)
  } catch {
    return null
  }
}

async function setRedisValue(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  const redis = getRedisConfig()
  if (!redis) return

  const encoded = JSON.stringify(value)

  try {
    await fetch(`${redis.url}/pipeline`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${redis.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify([['SET', key, encoded, 'EX', ttlSeconds]]),
      signal: AbortSignal.timeout(REDIS_OP_TIMEOUT_MS),
    })
  } catch {
    // Best-effort cache write.
  }
}

async function readCache(key: string): Promise<CacheRead | null> {
  const memoryValue = getFreshMemoryValue(key)
  if (memoryValue !== null) {
    return { value: memoryValue, source: 'memory' }
  }

  const redisValue = await getRedisValue(key)
  if (redisValue !== null) {
    setMemoryValue(key, redisValue, 60)
    return { value: redisValue, source: 'redis' }
  }

  return null
}

function getStaleValue<T>(key: string, staleMaxAgeMs: number): T | null {
  const entry = staleCache.get(key)
  if (!entry) return null
  if (nowMs() - entry.updatedAt > staleMaxAgeMs) return null
  return entry.value as T
}

export async function cachedFetchWithFallback<T>(
  options: CachedFetchOptions<T>,
): Promise<CachedFetchResult<T>> {
  const {
    key,
    ttlSeconds,
    fetcher,
    negativeTtlSeconds = 120,
    staleMaxAgeMs = 6 * 60 * 60 * 1_000,
  } = options

  const cached = await readCache(key)
  if (cached) {
    if (cached.value === NEG_SENTINEL) {
      return { data: null, source: cached.source }
    }

    setStaleValue(key, cached.value)
    return { data: cached.value as T, source: cached.source }
  }

  const currentInflight = inflight.get(key)
  if (currentInflight) {
    return (await currentInflight) as CachedFetchResult<T>
  }

  const task = (async (): Promise<CachedFetchResult<T>> => {
    try {
      const fresh = await fetcher()
      if (fresh === null) {
        setMemoryValue(key, NEG_SENTINEL, negativeTtlSeconds)
        void setRedisValue(key, NEG_SENTINEL, negativeTtlSeconds)
        return { data: null, source: 'fresh' }
      }

      setMemoryValue(key, fresh, ttlSeconds)
      setStaleValue(key, fresh)
      void setRedisValue(key, fresh, ttlSeconds)
      return { data: fresh, source: 'fresh' }
    } catch {
      const stale = getStaleValue<T>(key, staleMaxAgeMs)
      if (stale !== null) {
        return { data: stale, source: 'stale' }
      }

      throw new Error(`No cached or stale data for key "${key}"`)
    } finally {
      inflight.delete(key)
    }
  })()

  inflight.set(key, task as Promise<CachedFetchResult<unknown>>)
  return task
}

export function clearCacheForTests(): void {
  memoryCache.clear()
  staleCache.clear()
  inflight.clear()
}

interface CacheEntry<T> {
  expiresAt: number
  value: T
}

interface AsyncTtlCacheOptions {
  maxEntries?: number
  now?: () => number
}

export class AsyncTtlCache<T> {
  private readonly entries = new Map<string, CacheEntry<T>>()
  private readonly inflight = new Map<string, Promise<T | null>>()
  private readonly maxEntries: number
  private readonly now: () => number

  constructor({ maxEntries = 16, now = Date.now }: AsyncTtlCacheOptions = {}) {
    this.maxEntries = maxEntries
    this.now = now
  }

  get(key: string, ttlMs: number, loader: () => Promise<T | null>): Promise<T | null> {
    const cached = this.entries.get(key)
    if (cached && cached.expiresAt > this.now()) return Promise.resolve(cached.value)
    if (cached) this.entries.delete(key)

    const pending = this.inflight.get(key)
    if (pending) return pending

    const load = loader().then((value) => {
      if (value !== null) {
        this.entries.delete(key)
        this.entries.set(key, { value, expiresAt: this.now() + ttlMs })
        while (this.entries.size > this.maxEntries) {
          const oldest = this.entries.keys().next().value
          if (typeof oldest !== 'string') break
          this.entries.delete(oldest)
        }
      }
      return value
    }).finally(() => this.inflight.delete(key))

    this.inflight.set(key, load)
    return load
  }

  clear(): void {
    this.entries.clear()
    this.inflight.clear()
  }
}

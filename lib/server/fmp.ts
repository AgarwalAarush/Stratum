export interface FmpRequestOptions {
  apiKey: string
  fetchImpl?: typeof fetch
  baseUrl?: string
  timeoutMs?: number
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

  const response = await (options.fetchImpl ?? fetch)(url, {
    signal: AbortSignal.timeout(options.timeoutMs ?? 12_000),
    headers: {
      Accept: 'application/json',
      'User-Agent': 'Stratum/0.3 (+market-intelligence-worker)',
    },
  })

  if (!response.ok) {
    throw new FmpRequestError(response.status, normalizedEndpoint)
  }

  return await response.json() as T
}

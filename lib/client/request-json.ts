const DEFAULT_TIMEOUT_MS = 15_000

export interface JsonRequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown
  errorMessage?: string
  timeoutMs?: number
}

export class JsonRequestError extends Error {
  readonly status: number | undefined

  constructor(message: string, status?: number, cause?: unknown) {
    super(message, { cause })
    this.name = 'JsonRequestError'
    this.status = status
  }
}

function responseError(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object' || !('error' in payload)) return null
  const error = payload.error
  if (typeof error === 'string' && error.trim()) return error
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string' && error.message.trim()) {
    return error.message
  }
  return null
}

/** Sends one request. A response type documents the endpoint contract; it does not validate domain data. */
export async function requestJson<T>(url: string, {
  body,
  errorMessage = 'The request could not be completed',
  timeoutMs = DEFAULT_TIMEOUT_MS,
  signal,
  ...options
}: JsonRequestOptions = {}): Promise<T> {
  if (signal?.aborted) throw signal.reason

  const controller = new AbortController()
  const abort = () => controller.abort(signal?.reason)
  signal?.addEventListener('abort', abort, { once: true })
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort(new DOMException('The request timed out', 'TimeoutError'))
  }, timeoutMs)

  try {
    const headers = new Headers(options.headers)
    if (body !== undefined && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
    const response = await fetch(url, {
      ...options,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    })
    let payload: unknown
    try {
      payload = await response.json()
    } catch (cause) {
      if (controller.signal.aborted) throw cause
      const message = response.ok ? 'The server returned an unreadable response' : errorMessage
      throw new JsonRequestError(message, response.status, cause)
    }
    if (!response.ok) throw new JsonRequestError(responseError(payload) ?? errorMessage, response.status)
    return payload as T
  } catch (cause) {
    if (controller.signal.aborted) {
      if (timedOut) {
        const read = !options.method || ['GET', 'HEAD'].includes(options.method.toUpperCase())
        throw new JsonRequestError(`The request timed out. ${read ? 'Try again.' : 'Refresh to check whether the update completed.'}`, undefined, cause)
      }
      throw controller.signal.reason
    }
    if (cause instanceof JsonRequestError) throw cause
    throw new JsonRequestError(errorMessage, undefined, cause)
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', abort)
  }
}

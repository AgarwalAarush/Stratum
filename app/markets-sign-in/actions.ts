'use server'

import { cookies, headers } from 'next/headers'
import { redirect } from 'next/navigation'
import {
  MARKETS_SESSION_COOKIE,
  createMarketsSessionToken,
  hasMarketsAuthConfig,
  marketsSessionCookieOptions,
  verifyMarketsPassword,
} from '@/lib/auth/markets-auth'

const FAILURE_WINDOW_SECONDS = 10 * 60
const FAILURE_LIMIT = 10
const localFailures = new Map<string, { count: number; expiresAt: number }>()

function safeNext(value: FormDataEntryValue | null): string {
  const next = typeof value === 'string' ? value : ''
  return next.startsWith('/markets') && !next.startsWith('//') ? next : '/markets'
}

function loginKey(identifier: string): string {
  const normalized = identifier.replace(/[^a-zA-Z0-9:._-]/g, '').slice(0, 120) || 'unknown'
  return `stratum:markets:login-failures:${normalized}`
}

async function recordFailedLogin(identifier: string): Promise<boolean> {
  const key = loginKey(identifier)
  const redisUrl = process.env.UPSTASH_REDIS_REST_URL
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN
  if (redisUrl && redisToken) {
    try {
      const response = await fetch(`${redisUrl}/pipeline`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${redisToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify([
          ['INCR', key],
          ['EXPIRE', key, FAILURE_WINDOW_SECONDS, 'NX'],
        ]),
        signal: AbortSignal.timeout(1_500),
      })
      if (response.ok) {
        const result = await response.json() as Array<{ result?: number | string }>
        return Number(result[0]?.result ?? 0) > FAILURE_LIMIT
      }
    } catch {
      // Fall back to a per-instance limiter when Redis is temporarily unavailable.
    }
  }

  const now = Date.now()
  const current = localFailures.get(key)
  const next = !current || current.expiresAt <= now
    ? { count: 1, expiresAt: now + FAILURE_WINDOW_SECONDS * 1_000 }
    : { ...current, count: current.count + 1 }
  localFailures.set(key, next)
  return next.count > FAILURE_LIMIT
}

export async function signInMarkets(formData: FormData) {
  const next = safeNext(formData.get('next'))
  if (!hasMarketsAuthConfig()) redirect(`/markets-sign-in?error=configuration&next=${encodeURIComponent(next)}`)

  const password = String(formData.get('password') ?? '')
  const headerStore = await headers()
  const identifier = headerStore.get('x-forwarded-for')?.split(',')[0]?.trim()
    ?? headerStore.get('x-real-ip')
    ?? 'unknown'
  if (!await verifyMarketsPassword(password)) {
    const limited = await recordFailedLogin(identifier)
    redirect(`/markets-sign-in?error=${limited ? 'rate-limit' : 'invalid'}&next=${encodeURIComponent(next)}`)
  }

  const token = await createMarketsSessionToken()
  if (!token) redirect(`/markets-sign-in?error=configuration&next=${encodeURIComponent(next)}`)
  const cookieStore = await cookies()
  cookieStore.set(MARKETS_SESSION_COOKIE, token, marketsSessionCookieOptions())
  redirect(next)
}

export async function signOutMarkets() {
  const cookieStore = await cookies()
  cookieStore.delete(MARKETS_SESSION_COOKIE)
  redirect('/markets-sign-in')
}

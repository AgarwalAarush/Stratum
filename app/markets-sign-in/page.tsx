import type { Metadata } from 'next'
import Link from 'next/link'
import { signInMarkets } from './actions'

export const metadata: Metadata = {
  title: 'Sign in — Stratum Markets',
  robots: { index: false, follow: false },
}

function safeNext(value: string | string[] | undefined): string {
  return typeof value === 'string' && value.startsWith('/markets') && !value.startsWith('//')
    ? value
    : '/markets'
}

export default async function MarketsSignInPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const error = typeof params.error === 'string' ? params.error : null
  const next = safeNext(params.next)

  return (
    <main className="markets-auth-page">
      <section className="markets-auth-panel">
        <Link href="/ai-research" className="markets-auth-wordmark">STRATUM</Link>
        <p className="markets-eyebrow">Private workspace</p>
        <h1>Markets sign in</h1>
        <p className="markets-auth-copy">
          Price data, research, watchlists, and portfolio decisions are protected by your private workspace password.
        </p>
        <form action={signInMarkets} className="markets-auth-form">
          <input type="hidden" name="next" value={next} />
          <label htmlFor="markets-password">Password</label>
          <input
            id="markets-password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            autoFocus
          />
          <button type="submit">Open Markets</button>
        </form>
        {error && (
          <p className="markets-auth-error" role="alert">
            {error === 'configuration'
              ? 'Markets authentication is not configured yet.'
              : error === 'rate-limit'
                ? 'Too many failed attempts. Wait ten minutes and try again.'
                : 'That password is not correct.'}
          </p>
        )}
        <Link href="/ai-research" className="markets-auth-back">Return to Intelligence</Link>
      </section>
    </main>
  )
}

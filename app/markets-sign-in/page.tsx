import type { Metadata } from 'next'
import Link from 'next/link'
import { sendMarketsMagicLink } from './actions'

export const metadata: Metadata = {
  title: 'Sign in — Stratum Markets',
  robots: { index: false, follow: false },
}

export default async function MarketsSignInPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const sent = params.sent === '1'
  const error = typeof params.error === 'string' ? params.error : null

  return (
    <main className="markets-auth-page">
      <section className="markets-auth-panel">
        <Link href="/ai-research" className="markets-auth-wordmark">STRATUM</Link>
        <p className="markets-eyebrow">Private workspace</p>
        <h1>Markets sign in</h1>
        <p className="markets-auth-copy">
          Price data, research, watchlists, and portfolio decisions are restricted to the approved account.
        </p>
        {sent ? (
          <div className="markets-auth-notice" role="status">
            If that address is approved, its sign-in link is on the way.
          </div>
        ) : (
          <form action={sendMarketsMagicLink} className="markets-auth-form">
            <label htmlFor="markets-email">Email</label>
            <input id="markets-email" name="email" type="email" autoComplete="email" required autoFocus />
            <button type="submit">Email me a sign-in link</button>
          </form>
        )}
        {error && (
          <p className="markets-auth-error" role="alert">
            {error === 'not-allowed'
              ? 'This account is not approved for Markets.'
              : error === 'configuration'
                ? 'Markets authentication is not configured yet.'
                : 'The sign-in link could not be sent. Try again.'}
          </p>
        )}
        <Link href="/ai-research" className="markets-auth-back">Return to Intelligence</Link>
      </section>
    </main>
  )
}

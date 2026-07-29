'use client'

import Link from 'next/link'
import { FormEvent, useState } from 'react'
import { MarketsWatchlists } from './MarketsWatchlists'
import type { PortfolioWorkspaceData, ScreenerResponse } from '@/lib/markets/types'

type PortfolioView = 'watchlists' | 'ideas' | 'owned' | 'decision-inbox' | 'history'

export function PortfolioWorkspace({
  initialData,
  universe,
}: {
  initialData: PortfolioWorkspaceData
  universe: ScreenerResponse
}) {
  const [view, setView] = useState<PortfolioView>('watchlists')
  const [positions, setPositions] = useState(initialData.positions)
  const [inbox, setInbox] = useState(initialData.inbox)
  const [notice, setNotice] = useState('')

  const savePosition = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const response = await fetch('/api/markets/portfolio', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'save-position',
        symbol: form.get('symbol'),
        shares: form.get('shares'),
        costBasisPerShare: form.get('costBasisPerShare'),
        openedAt: form.get('openedAt'),
        notes: form.get('notes'),
      }),
    })
    const payload = await response.json()
    if (!response.ok) {
      setNotice(payload.error ?? 'Position could not be saved')
      return
    }
    setPositions((current) => [payload.position, ...current.filter((item) => item.symbol !== payload.position.symbol)])
    setNotice(`${payload.position.symbol} position saved.`)
    event.currentTarget.reset()
  }

  const closeInbox = async (id: string, status: 'dismissed' | 'resolved') => {
    const response = await fetch('/api/markets/portfolio', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'update-inbox', itemId: id, status }),
    })
    if (response.ok) setInbox((current) => current.filter((item) => item.id !== id))
  }

  const decisions = initialData.decisions
  const ideas = decisions.filter((decision) => decision.disposition !== 'own')
  return (
    <section className="portfolio-workspace">
      <header className="market-explore-heading">
        <div><p className="markets-eyebrow">Manual state · no brokerage execution</p><h1 className="markets-display">Portfolio</h1></div>
        <span>{inbox.length} actionable items</span>
      </header>
      <nav className="market-portfolio-tabs" aria-label="Portfolio workflow">
        {([
          ['watchlists', 'Watchlists'],
          ['ideas', 'Ideas'],
          ['owned', 'Owned'],
          ['decision-inbox', 'Decision Inbox'],
          ['history', 'History'],
        ] as const).map(([id, label]) => (
          <button key={id} type="button" aria-current={view === id ? 'page' : undefined} onClick={() => setView(id)}>{label}</button>
        ))}
      </nav>
      {view === 'watchlists' ? (
        <MarketsWatchlists
          universe={universe}
          initialState={initialData.watchlists}
          migrateLocalOnMount={!initialData.watchlistsPersisted}
        />
      ) : null}
      {view === 'ideas' ? (
        <div className="portfolio-record-list">
          {ideas.length === 0 ? <p>No classified ideas yet. Save a Stock Viewer decision as Watch or Avoid.</p> : ideas.map((decision) => (
            <Link key={decision.id} href={`/markets/stocks/${decision.symbol}`}>
              <strong>{decision.symbol}</strong><span>{decision.disposition} · {decision.formalRating} · {decision.entryAction.replaceAll('_', ' ')}</span>
            </Link>
          ))}
        </div>
      ) : null}
      {view === 'owned' ? (
        <div className="portfolio-owned-layout">
          <form className="manual-position-form" onSubmit={savePosition}>
            <p className="markets-eyebrow">Add or update manually</p>
            <h2>Position</h2>
            <label>Symbol<input name="symbol" required maxLength={12} /></label>
            <label>Shares<input name="shares" type="number" step="any" min="0.000001" required /></label>
            <label>Cost basis / share<input name="costBasisPerShare" type="number" step="0.01" min="0" required /></label>
            <label>Opened<input name="openedAt" type="date" /></label>
            <label>Notes<textarea name="notes" /></label>
            <button type="submit">Save manual position</button>
            {notice ? <p>{notice}</p> : null}
          </form>
          <div className="portfolio-position-list">
            {positions.length === 0 ? <p>No manually entered positions.</p> : positions.map((position) => (
              <Link key={position.id} href={`/markets/stocks/${position.symbol}`}>
                <strong>{position.symbol}</strong>
                <span>{position.shares.toLocaleString()} shares · ${position.costBasisPerShare.toFixed(2)} basis</span>
              </Link>
            ))}
          </div>
        </div>
      ) : null}
      {view === 'decision-inbox' ? (
        <div className="decision-inbox-list">
          {inbox.length === 0 ? <p>Nothing requires a decision right now.</p> : inbox.map((item) => (
            <article key={item.id}>
              <div><span>{item.type.replaceAll('_', ' ')}</span><time>{new Date(item.occurredAt).toLocaleString()}</time></div>
              <h2><Link href={`/markets/stocks/${item.symbol}`}>{item.title}</Link></h2>
              <p>{item.summary}</p>
              <footer><button type="button" onClick={() => closeInbox(item.id, 'resolved')}>Resolve</button><button type="button" onClick={() => closeInbox(item.id, 'dismissed')}>Dismiss</button></footer>
            </article>
          ))}
        </div>
      ) : null}
      {view === 'history' ? (
        <div className="portfolio-history-list">
          {initialData.decisionHistory.length === 0 ? <p>No decision versions yet.</p> : initialData.decisionHistory.map((decision) => (
            <article key={decision.id}><time>{new Date(decision.createdAt).toLocaleDateString()}</time><strong>{decision.symbol}</strong><span>{decision.formalRating} · {decision.entryAction.replaceAll('_', ' ')}</span><p>{decision.rationale}</p></article>
          ))}
        </div>
      ) : null}
    </section>
  )
}

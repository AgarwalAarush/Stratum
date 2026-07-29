'use client'

import { FormEvent, useState } from 'react'
import { formatEntryAction } from '@/lib/markets/research-presentation'
import { MarketsIntentLink } from './MarketsIntentLink'
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
  const [reviews, setReviews] = useState(initialData.reviews)
  const [reviewingDecisionId, setReviewingDecisionId] = useState<string | null>(null)
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

  const saveReview = async (event: FormEvent<HTMLFormElement>, decisionId: string, symbol: string) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const response = await fetch('/api/markets/portfolio', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'save-review',
        decisionId,
        symbol,
        outcome: form.get('outcome'),
        expectationAssessment: form.get('expectationAssessment'),
        lessons: form.get('lessons'),
        postmortem: form.get('postmortem'),
      }),
    })
    const payload = await response.json()
    if (!response.ok) {
      setNotice(payload.error ?? 'Review could not be saved')
      return
    }
    setReviews((current) => [payload.review, ...current.filter((item) => item.decisionId !== decisionId)])
    setReviewingDecisionId(null)
    setNotice(`${symbol} decision review saved.`)
  }

  const decisions = initialData.decisions
  const ideas = decisions.filter((decision) => decision.disposition !== 'own')
  const priceBySymbol = new Map(universe.rows.map((row) => [row.symbol, row.price]))
  const reviewByDecision = new Map(reviews.map((review) => [review.decisionId, review]))
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
            <MarketsIntentLink key={decision.id} href={`/markets/stocks/${decision.symbol}`}>
              <strong>{decision.symbol}</strong><span>{decision.disposition} · {decision.formalRating} · {formatEntryAction(decision.entryAction)}</span>
            </MarketsIntentLink>
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
              <MarketsIntentLink key={position.id} href={`/markets/stocks/${position.symbol}`}>
                <strong>{position.symbol}</strong>
                <span>{position.shares.toLocaleString()} shares · ${position.costBasisPerShare.toFixed(2)} basis</span>
              </MarketsIntentLink>
            ))}
          </div>
        </div>
      ) : null}
      {view === 'decision-inbox' ? (
        <div className="decision-inbox-list">
          {inbox.length === 0 ? <p>Nothing requires a decision right now.</p> : inbox.map((item) => (
            <article key={item.id}>
              <div><span>{item.type.replaceAll('_', ' ')}</span><time>{new Date(item.occurredAt).toLocaleString()}</time></div>
              <h2><MarketsIntentLink href={`/markets/stocks/${item.symbol}`}>{item.title}</MarketsIntentLink></h2>
              <p>{item.summary}</p>
              <footer><button type="button" onClick={() => closeInbox(item.id, 'resolved')}>Resolve</button><button type="button" onClick={() => closeInbox(item.id, 'dismissed')}>Dismiss</button></footer>
            </article>
          ))}
        </div>
      ) : null}
      {view === 'history' ? (
        <div className="portfolio-history-list">
          {initialData.decisionHistory.length === 0 ? <p>No decision versions yet.</p> : initialData.decisionHistory.map((decision) => (
            <article key={decision.id}>
              <header>
                <div><strong>{decision.symbol}</strong><span>Thesis v{decision.version}</span></div>
                <time>{new Date(decision.createdAt).toLocaleDateString()}</time>
              </header>
              <div className="portfolio-history-comparison">
                <div><span>Original expectation</span><p>{decision.rationale || 'No rationale recorded.'}</p></div>
                <div>
                  <span>Observed outcome</span>
                  <p>
                    {decision.priceAtDecision === null || priceBySymbol.get(decision.symbol) === undefined
                      ? 'A comparable market snapshot is not available.'
                      : `${decision.priceAtDecision.toFixed(2)} at decision → ${priceBySymbol.get(decision.symbol)!.toFixed(2)} now (${(((priceBySymbol.get(decision.symbol)! / decision.priceAtDecision) - 1) * 100).toFixed(1)}%).`}
                  </p>
                </div>
                <div><span>Decision</span><p>{decision.formalRating} · {formatEntryAction(decision.entryAction)} · fair value {decision.fairValue ?? '—'}</p></div>
              </div>
              {reviewByDecision.get(decision.id) ? (
                <div className="portfolio-review-summary">
                  <span>{reviewByDecision.get(decision.id)!.outcome.replaceAll('_', ' ')}</span>
                  <p>{reviewByDecision.get(decision.id)!.expectationAssessment}</p>
                  <small>{reviewByDecision.get(decision.id)!.lessons}</small>
                </div>
              ) : null}
              {reviewingDecisionId === decision.id ? (
                <form className="decision-review-form" onSubmit={(event) => saveReview(event, decision.id, decision.symbol)}>
                  <label>Outcome<select name="outcome" required><option value="working">Working</option><option value="not_working">Not working</option><option value="invalidated">Invalidated</option><option value="closed">Closed</option></select></label>
                  <label>Expectation vs outcome<textarea name="expectationAssessment" required /></label>
                  <label>Lessons<textarea name="lessons" required /></label>
                  <label>Postmortem<textarea name="postmortem" /></label>
                  <div><button type="submit">Save review</button><button type="button" onClick={() => setReviewingDecisionId(null)}>Cancel</button></div>
                </form>
              ) : <button type="button" onClick={() => setReviewingDecisionId(decision.id)}>Review outcome</button>}
            </article>
          ))}
          {notice ? <p className="portfolio-review-notice">{notice}</p> : null}
        </div>
      ) : null}
    </section>
  )
}

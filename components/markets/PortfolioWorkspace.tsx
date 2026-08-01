'use client'

import { FormEvent, useState } from 'react'
import { useRouter } from 'next/navigation'
import { formatEntryAction } from '@/lib/markets/research-presentation'
import { parsePortfolioUpdate, type ParsedPortfolioUpdate } from '@/lib/markets/portfolio-updates'
import { MarketsIntentLink } from './MarketsIntentLink'
import { MarketsWatchlists } from './MarketsWatchlists'
import type { PortfolioWorkspaceData, ScreenerResponse } from '@/lib/markets/types'

type PortfolioView = 'watchlists' | 'ideas' | 'owned' | 'decision-inbox' | 'history'

function formatMoney(value: number | null): string {
  return value === null ? '—' : value.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
}

export function PortfolioWorkspace({
  initialData,
  universe,
}: {
  initialData: PortfolioWorkspaceData
  universe: ScreenerResponse
}) {
  const router = useRouter()
  const [view, setView] = useState<PortfolioView>('watchlists')
  const portfolios = initialData.portfolios
  const portfolioTransactions = initialData.portfolioTransactions
  const [activePortfolioId, setActivePortfolioId] = useState(initialData.portfolios[0]?.account.id ?? '')
  const [updateMode, setUpdateMode] = useState<'form' | 'language'>('form')
  const [structuredAction, setStructuredAction] = useState<ParsedPortfolioUpdate['action']>('buy')
  const [instruction, setInstruction] = useState('')
  const [preview, setPreview] = useState<ParsedPortfolioUpdate | null>(null)
  const [inbox, setInbox] = useState(initialData.inbox)
  const [reviews, setReviews] = useState(initialData.reviews)
  const [reviewingDecisionId, setReviewingDecisionId] = useState<string | null>(null)
  const [notice, setNotice] = useState('')

  const activePortfolio = portfolios.find((portfolio) => portfolio.account.id === activePortfolioId) ?? null
  const structuredActionIsCash = structuredAction === 'cash_deposit' || structuredAction === 'cash_withdrawal'

  const recordPortfolioUpdate = async (update: ParsedPortfolioUpdate, source: 'manual' | 'natural_language') => {
    if (!activePortfolio) {
      setNotice('Choose a portfolio before recording an update.')
      return
    }
    const response = await fetch('/api/markets/portfolio', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'record-portfolio-update',
        portfolioId: activePortfolio.account.id,
        source,
        ...(source === 'natural_language' ? { instruction } : {
          transactionAction: update.action,
          symbol: update.symbol,
          quantity: update.quantity,
          pricePerShare: update.pricePerShare,
          fees: update.fees,
          occurredAt: update.occurredAt,
          notes: update.notes,
        }),
      }),
    })
    const payload = await response.json()
    if (!response.ok) {
      setNotice(payload.error ?? 'Portfolio update could not be recorded')
      return
    }
    setPreview(null)
    setInstruction('')
    setNotice('Portfolio updated. Recalculating balances…')
    router.refresh()
  }

  const submitStructuredUpdate = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const action = String(form.get('transactionAction')) as ParsedPortfolioUpdate['action']
    const isCash = action === 'cash_deposit' || action === 'cash_withdrawal'
    void recordPortfolioUpdate({
      action,
      symbol: isCash ? null : String(form.get('symbol') ?? '').trim().toUpperCase() || null,
      quantity: isCash ? null : Number(form.get('quantity')),
      pricePerShare: isCash ? Number(form.get('cashAmount')) : Number(form.get('pricePerShare')),
      fees: isCash ? 0 : Number(form.get('fees') || 0),
      occurredAt: String(form.get('occurredAt') ?? ''),
      notes: String(form.get('notes') ?? '').trim(),
    }, 'manual')
    event.currentTarget.reset()
  }

  const previewNaturalLanguageUpdate = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const parsed = parsePortfolioUpdate(instruction)
    if (!parsed) {
      setNotice('Try “Buy 10 shares of NVDA at $200” or “Deposit $5,000 cash”.')
      return
    }
    setNotice('')
    setPreview(parsed)
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
      <section className="portfolio-account-switcher" aria-label="Portfolio selection">
        <label>
          Active portfolio
          <select value={activePortfolioId} onChange={(event) => setActivePortfolioId(event.target.value)}>
            {portfolios.map((portfolio) => <option key={portfolio.account.id} value={portfolio.account.id}>{portfolio.account.name}</option>)}
          </select>
        </label>
        {activePortfolio ? <div className="portfolio-account-summary">
          <span><small>Opening fund</small>{formatMoney(activePortfolio.account.initialFunds)}</span>
          <span><small>Cash</small>{formatMoney(activePortfolio.cashBalance)}</span>
          <span><small>Market value</small>{formatMoney(activePortfolio.marketValue)}</span>
          <span><small>Unrealized P&amp;L</small>{formatMoney(activePortfolio.unrealizedPnl)}</span>
        </div> : <p className="portfolio-empty-state">Portfolio records will appear after the database migration is applied.</p>}
      </section>
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
          <div className="portfolio-update-panel">
            <div className="portfolio-update-heading"><p className="markets-eyebrow">Record an update</p><h2>{activePortfolio?.account.name ?? 'Portfolio'}</h2></div>
            <div className="portfolio-update-mode" role="group" aria-label="Update method">
              <button type="button" aria-pressed={updateMode === 'form'} onClick={() => setUpdateMode('form')}>Enter transaction</button>
              <button type="button" aria-pressed={updateMode === 'language'} onClick={() => setUpdateMode('language')}>Use natural language</button>
            </div>
            {updateMode === 'form' ? <form className="manual-position-form" onSubmit={submitStructuredUpdate}>
              <label>Action<select name="transactionAction" required value={structuredAction} onChange={(event) => setStructuredAction(event.target.value as ParsedPortfolioUpdate['action'])}><option value="buy">Buy</option><option value="sell">Sell</option><option value="cash_deposit">Add cash</option><option value="cash_withdrawal">Withdraw cash</option></select></label>
              {structuredActionIsCash ? <label>Cash amount<input name="cashAmount" type="number" step="0.01" min="0.01" required /></label> : <>
                <label>Symbol<input name="symbol" maxLength={12} placeholder="NVDA" required /></label>
                <label>Shares<input name="quantity" type="number" step="any" min="0.000001" required /></label>
                <label>Price / share<input name="pricePerShare" type="number" step="0.0001" min="0.0001" required /></label>
                <label>Fees<input name="fees" type="number" step="0.01" min="0" defaultValue="0" /></label>
              </>}
              <label>Date<input name="occurredAt" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} /></label>
              <label>Notes<textarea name="notes" placeholder="Optional reason or context" /></label>
              <button type="submit" disabled={!activePortfolio}>Record transaction</button>
            </form> : <form className="natural-language-update" onSubmit={previewNaturalLanguageUpdate}>
              <label>Describe the update<textarea value={instruction} onChange={(event) => setInstruction(event.target.value)} placeholder="Buy 10 shares of NVDA at $200" required /></label>
              <p>Also works for: “Sell 2 AMD at $490” or “Deposit $5,000 cash”.</p>
              <button type="submit" disabled={!activePortfolio}>Preview update</button>
            </form>}
            {preview ? <div className="portfolio-update-preview" role="status">
              <strong>Confirm this update</strong>
              <p>{preview.action.replaceAll('_', ' ')}{preview.symbol ? ` · ${preview.quantity} ${preview.symbol} at ${formatMoney(preview.pricePerShare)}` : ` · ${formatMoney(preview.pricePerShare)}`} · {preview.occurredAt}</p>
              <div><button type="button" onClick={() => void recordPortfolioUpdate(preview, 'natural_language')}>Confirm and record</button><button type="button" onClick={() => setPreview(null)}>Edit</button></div>
            </div> : null}
            {notice ? <p className="portfolio-update-notice" role="status">{notice}</p> : null}
          </div>
          <div className="portfolio-position-list">
            <div className="portfolio-position-list-heading"><div><p className="markets-eyebrow">Calculated holdings</p><h2>{activePortfolio?.holdings.length ?? 0} positions</h2></div><span>{activePortfolio?.marketValue === null ? 'Quotes incomplete' : `Value ${formatMoney(activePortfolio?.marketValue ?? null)}`}</span></div>
            {activePortfolio?.holdings.length ? activePortfolio.holdings.map((holding) => (
              <MarketsIntentLink key={holding.symbol} href={`/markets/stocks/${holding.symbol}`}>
                <strong>{holding.symbol}</strong>
                <span>{holding.quantity.toLocaleString(undefined, { maximumFractionDigits: 6 })} shares · {formatMoney(holding.costBasisPerShare)} basis · {holding.currentPrice === null ? 'No current quote' : `${formatMoney(holding.currentValue)} value`}</span>
              </MarketsIntentLink>
            )) : <p>No holdings recorded for this portfolio yet.</p>}
            {portfolioTransactions.filter((transaction) => transaction.portfolioId === activePortfolioId).length > 0 ? <div className="portfolio-recent-transactions"><p className="markets-eyebrow">Recent ledger</p>{portfolioTransactions.filter((transaction) => transaction.portfolioId === activePortfolioId).slice(-5).reverse().map((transaction) => <p key={transaction.id}>{transaction.occurredAt} · {transaction.action.replaceAll('_', ' ')}{transaction.symbol ? ` ${transaction.symbol}` : ''}</p>)}</div> : null}
          </div>
        </div>
      ) : null}
      {view === 'decision-inbox' ? (
        <div className="decision-inbox-list">
          {inbox.length === 0 ? <p>Nothing requires a decision right now.</p> : inbox.map((item) => (
            <article key={item.id}>
              <div><span>{item.type.replaceAll('_', ' ')}</span><time>{new Date(item.occurredAt).toLocaleString()}</time></div>
              <h2>{item.symbol
                ? <MarketsIntentLink href={`/markets/stocks/${item.symbol}`}>{item.title}</MarketsIntentLink>
                : <MarketsIntentLink href="/markets/theses">{item.title}</MarketsIntentLink>}</h2>
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

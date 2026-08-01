'use client'

import { FormEvent, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { CaretDown, Check, Plus, X } from '@phosphor-icons/react'
import { formatEntryAction } from '@/lib/markets/research-presentation'
import { parsePortfolioUpdate, type ParsedPortfolioUpdate } from '@/lib/markets/portfolio-updates'
import { MarketsIntentLink } from './MarketsIntentLink'
import { MarketSparkline } from './MarketSparkline'
import type { PortfolioHolding, PortfolioWorkspaceData, ScreenerResponse, ScreenerRow } from '@/lib/markets/types'

type PortfolioView = 'owned' | 'alerts' | 'history'

function formatMoney(value: number | null): string {
  return value === null ? '—' : value.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
}

function formatPrice(value: number | null): string {
  return value === null ? '—' : value.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function formatPercent(value: number | null): string {
  return value === null ? '—' : `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`
}

function weightedReturn(holdings: PortfolioHolding[], rows: Map<string, ScreenerRow>, key: 'dailyChange' | 'return30d' | 'return90d' | 'returnYtd' | 'return1y'): number | null {
  const eligible = holdings.flatMap((holding) => {
    const row = rows.get(holding.symbol)
    const weight = holding.currentValue ?? holding.totalCost
    const value = row?.[key]
    return value === null || value === undefined || weight <= 0 ? [] : [{ weight, value }]
  })
  const totalWeight = eligible.reduce((total, item) => total + item.weight, 0)
  return totalWeight === 0 ? null : eligible.reduce((total, item) => total + item.weight * item.value, 0) / totalWeight
}

function asOf(value: string | undefined): string {
  if (!value) return '—'
  return new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }).format(new Date(value))
}

export function PortfolioWorkspace({
  initialData,
  universe,
}: {
  initialData: PortfolioWorkspaceData
  universe: ScreenerResponse
}) {
  const router = useRouter()
  const [view, setView] = useState<PortfolioView>('owned')
  const portfolios = initialData.portfolios
  const [activePortfolioId, setActivePortfolioId] = useState(initialData.portfolios[0]?.account.id ?? '')
  const [portfolioPickerOpen, setPortfolioPickerOpen] = useState(false)
  const [recordingOpen, setRecordingOpen] = useState(false)
  const [updateMode, setUpdateMode] = useState<'form' | 'language'>('form')
  const [structuredAction, setStructuredAction] = useState<ParsedPortfolioUpdate['action']>('buy')
  const [instruction, setInstruction] = useState('')
  const [preview, setPreview] = useState<ParsedPortfolioUpdate | null>(null)
  const [inbox, setInbox] = useState(initialData.inbox)
  const [reviews, setReviews] = useState(initialData.reviews)
  const [reviewingDecisionId, setReviewingDecisionId] = useState<string | null>(null)
  const [notice, setNotice] = useState('')
  const recordTriggerRef = useRef<HTMLButtonElement>(null)

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

  const priceBySymbol = new Map(universe.rows.map((row) => [row.symbol, row.price]))
  const rowBySymbol = new Map(universe.rows.map((row) => [row.symbol, row]))
  const reviewByDecision = new Map(reviews.map((review) => [review.decisionId, review]))
  const performance = activePortfolio ? [
    ['Today', weightedReturn(activePortfolio.holdings, rowBySymbol, 'dailyChange')],
    ['30D', weightedReturn(activePortfolio.holdings, rowBySymbol, 'return30d')],
    ['3M', weightedReturn(activePortfolio.holdings, rowBySymbol, 'return90d')],
    ['YTD', weightedReturn(activePortfolio.holdings, rowBySymbol, 'returnYtd')],
    ['1Y', weightedReturn(activePortfolio.holdings, rowBySymbol, 'return1y')],
  ] as const : []
  const activeAlerts = activePortfolio
    ? inbox.filter((item) => item.portfolioId === activePortfolio.account.id)
    : []

  const openRecording = () => {
    setNotice('')
    setPreview(null)
    setRecordingOpen(true)
  }

  const closeRecording = () => {
    setPreview(null)
    setRecordingOpen(false)
    recordTriggerRef.current?.focus()
  }

  useEffect(() => {
    if (!recordingOpen) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setPreview(null)
      setRecordingOpen(false)
      recordTriggerRef.current?.focus()
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [recordingOpen])

  return (
    <section className="portfolio-workspace">
      <header className="market-explore-heading">
        <div><p className="markets-eyebrow">Capital allocation workspace</p><h1 className="markets-display">Portfolio</h1></div>
        <div className="portfolio-heading-actions">
          <div className="portfolio-picker">
            <span>Active portfolio</span>
            <button type="button" aria-haspopup="listbox" aria-expanded={portfolioPickerOpen} onClick={() => setPortfolioPickerOpen((open) => !open)}>
              <strong>{activePortfolio?.account.name ?? 'Choose a portfolio'}</strong><CaretDown size={15} weight="bold" />
            </button>
            {portfolioPickerOpen ? <div className="portfolio-picker-menu" role="listbox" aria-label="Active portfolio">
              {portfolios.map((portfolio) => <button key={portfolio.account.id} type="button" role="option" aria-selected={portfolio.account.id === activePortfolioId} onClick={() => {
                setActivePortfolioId(portfolio.account.id)
                setPortfolioPickerOpen(false)
              }}>
                <span>{portfolio.account.name}</span>{portfolio.account.id === activePortfolioId ? <Check size={15} weight="bold" /> : null}
              </button>)}
            </div> : null}
          </div>
          <button ref={recordTriggerRef} type="button" className="portfolio-record-trigger" aria-haspopup="dialog" aria-expanded={recordingOpen} onClick={openRecording}><Plus size={14} weight="bold" /> Record update</button>
        </div>
      </header>
      <nav className="market-portfolio-tabs" aria-label="Portfolio workflow">
        {([
          ['owned', 'Owned'],
          ['alerts', 'Alerts'],
          ['history', 'History'],
        ] as const).map(([id, label]) => (
          <button key={id} type="button" aria-current={view === id ? 'page' : undefined} onClick={() => setView(id)}>{label}</button>
        ))}
      </nav>
      {view === 'owned' ? (
        <div className="portfolio-owned-workspace">
          {activePortfolio ? <>
            <section className="portfolio-owned-overview" aria-label={`${activePortfolio.account.name} overview`}>
              <div className="portfolio-value-summary">
                <div><span>Portfolio value</span><strong>{formatMoney(activePortfolio.totalValue)}</strong></div>
                <div><span>Equities</span><strong>{formatMoney(activePortfolio.marketValue)}</strong></div>
                <div><span>Cash</span><strong>{formatMoney(activePortfolio.cashBalance)}</strong></div>
                <div><span>Unrealized P&amp;L</span><strong className={(activePortfolio.unrealizedPnl ?? 0) >= 0 ? 'market-positive' : 'market-negative'}>{formatMoney(activePortfolio.unrealizedPnl)}</strong></div>
              </div>
              <div className="portfolio-performance-grid" aria-label="Market performance by holding weight">
                {performance.map(([label, value]) => <div key={label}><span>{label}</span><strong className={value === null ? '' : value >= 0 ? 'market-positive' : 'market-negative'}>{formatPercent(value)}</strong></div>)}
              </div>
              <p>Weighted from the current market snapshot · {universe.feed === 'illustrative' ? 'Illustrative' : 'Market'} data as of {asOf(universe.dataAsOf)}</p>
            </section>
            <section className="portfolio-holdings-table-section">
              <header><div><p className="markets-eyebrow">Owned</p><h2>{activePortfolio.holdings.length} positions</h2></div><span>{activePortfolio.marketValue === null ? 'Some quotes are unavailable' : `${formatMoney(activePortfolio.marketValue)} in equities`}</span></header>
              <div className="market-watchlist-table-wrap scrollbar-none">
                <table className="market-screen-table portfolio-holdings-table">
                  <thead><tr><th>Symbol</th><th>Company</th><th>Price</th><th>Change</th><th>Shares</th><th>Value</th><th>Gain</th><th>Range</th><th>50D MA</th><th>52W position</th><th>As of</th></tr></thead>
                  <tbody>{activePortfolio.holdings.length === 0 ? <tr><td colSpan={11} className="market-watchlist-empty"><strong>No holdings recorded for this portfolio.</strong><span>Use Record update to add a position or cash movement.</span></td></tr> : activePortfolio.holdings.map((holding) => <PortfolioHoldingRow key={holding.symbol} holding={holding} row={rowBySymbol.get(holding.symbol)} />)}</tbody>
                </table>
              </div>
            </section>
          </> : <p className="portfolio-empty-state">Portfolio records will appear after the database migration is applied.</p>}
        </div>
      ) : null}
      {view === 'alerts' ? (
        <div className="decision-inbox-list portfolio-alert-list">
          <header><div><p className="markets-eyebrow">Tracking</p><h2>{activePortfolio?.account.name ?? 'Portfolio'} alerts</h2></div><span>{activeAlerts.length} open</span></header>
          {activeAlerts.length === 0 ? <p className="portfolio-alert-empty">No open alerts for this portfolio. Material company events and position-level thesis thresholds will appear here.</p> : activeAlerts.map((item) => (
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
      {recordingOpen ? <div className="portfolio-update-modal-layer">
        <button type="button" className="portfolio-update-modal-backdrop" aria-label="Close record update dialog" onClick={closeRecording} />
        <section className="portfolio-update-panel" role="dialog" aria-modal="true" aria-labelledby="portfolio-update-title">
          <header className="portfolio-update-heading">
            <div><p className="markets-eyebrow">Record an update</p><h2 id="portfolio-update-title">{activePortfolio?.account.name ?? 'Portfolio'}</h2></div>
            <button type="button" className="portfolio-update-close" aria-label="Close record update dialog" onClick={closeRecording}><X size={17} /></button>
          </header>
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
            <label className="portfolio-update-notes">Notes<textarea name="notes" placeholder="Optional reason or context" /></label>
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
        </section>
      </div> : null}
    </section>
  )
}

function PortfolioHoldingRow({ holding, row }: { holding: PortfolioHolding; row: ScreenerRow | undefined }) {
  const gain = holding.unrealizedPnl
  const gainPercent = holding.totalCost === 0 || gain === null ? null : (gain / holding.totalCost) * 100
  return (
    <tr>
      <td><MarketsIntentLink className="market-symbol-button" href={`/markets/stocks/${holding.symbol}`} scroll={false}>{holding.symbol}</MarketsIntentLink></td>
      <td>{row?.company ?? 'No company data in the current snapshot'}</td>
      <td>{formatPrice(holding.currentPrice ?? row?.price ?? null)}</td>
      <td className={(row?.dailyChange ?? 0) >= 0 ? 'market-positive' : 'market-negative'}>{formatPercent(row?.dailyChange ?? null)}</td>
      <td>{holding.quantity.toLocaleString(undefined, { maximumFractionDigits: 4 })}</td>
      <td>{formatMoney(holding.currentValue)}</td>
      <td className={gain === null ? '' : gain >= 0 ? 'market-positive' : 'market-negative'}>{gainPercent === null ? '—' : `${formatMoney(gain)} · ${formatPercent(gainPercent)}`}</td>
      <td>{row ? <MarketSparkline values={row.range} label={`${holding.symbol} intraday range`} /> : '—'}</td>
      <td>{formatPrice(row?.fiftyDayAverage ?? null)}</td>
      <td>{row ? <div className="market-52-week-cell"><span>{row.fiftyTwoWeekPosition}%</span><span className="market-52-week-track"><i style={{ left: `${row.fiftyTwoWeekPosition}%` }} /></span></div> : '—'}</td>
      <td>{asOf(row?.asOf)}</td>
    </tr>
  )
}

'use client'

import { FormEvent, useEffect, useRef, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { CaretDown, Check, PencilSimple, Plus, Trash, X } from '@phosphor-icons/react'
import { formatEntryAction } from '@/lib/markets/research-presentation'
import { parsePortfolioUpdate, type ParsedPortfolioUpdate } from '@/lib/markets/portfolio-updates'
import { MarketsIntentLink } from './MarketsIntentLink'
import { MarketSparkline } from './MarketSparkline'
import { MarketSelect } from './MarketSelect'
import type { PortfolioHolding, PortfolioTransaction, PortfolioWorkspaceData, ScreenerResponse, ScreenerRow } from '@/lib/markets/types'

type PortfolioView = 'owned' | 'decisions' | 'alerts' | 'history'

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
  const pathname = usePathname()
  const searchParams = useSearchParams()
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
  const [editingTransaction, setEditingTransaction] = useState<PortfolioTransaction | null>(null)
  const [removeArmedId, setRemoveArmedId] = useState<string | null>(null)
  const recordTriggerRef = useRef<HTMLButtonElement>(null)
  const updateDialogRef = useRef<HTMLElement>(null)

  const requestedPortfolioId = searchParams.get('portfolio')
  const activePortfolio = portfolios.find((portfolio) => portfolio.account.id === (requestedPortfolioId ?? activePortfolioId)) ?? portfolios[0] ?? null
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
    const update = {
      action,
      symbol: isCash ? null : String(form.get('symbol') ?? '').trim().toUpperCase() || null,
      quantity: isCash ? null : Number(form.get('quantity')),
      pricePerShare: isCash ? Number(form.get('cashAmount')) : Number(form.get('pricePerShare')),
      fees: isCash ? 0 : Number(form.get('fees') || 0),
      occurredAt: String(form.get('occurredAt') ?? ''),
      notes: String(form.get('notes') ?? '').trim(),
    } as ParsedPortfolioUpdate
    if (editingTransaction) {
      void (async () => {
        const response = await fetch('/api/markets/portfolio', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'correct-portfolio-transaction', transactionId: editingTransaction.id, transactionAction: update.action, symbol: update.symbol, quantity: update.quantity, pricePerShare: update.pricePerShare, fees: update.fees, occurredAt: update.occurredAt, notes: update.notes }),
        })
        const payload = await response.json()
        if (!response.ok) {
          setNotice(payload.error ?? 'The ledger entry could not be corrected')
          return
        }
        setNotice('Ledger entry corrected. The original remains in the audit trail.')
        closeRecording()
        router.refresh()
      })()
    } else {
      void recordPortfolioUpdate(update, 'manual')
    }
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
  const constraintByDecision = new Map(initialData.constraintAssessments.map((assessment) => [assessment.decisionId, assessment]))
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
  const activeDecisions = activePortfolio
    ? initialData.decisions.filter((decision) => decision.portfolioId === activePortfolio.account.id || decision.portfolioId === null)
    : []

  const openRecording = () => {
    setNotice('')
    setPreview(null)
    setEditingTransaction(null)
    setRecordingOpen(true)
  }

  const closeRecording = () => {
    setPreview(null)
    setEditingTransaction(null)
    setRecordingOpen(false)
    recordTriggerRef.current?.focus()
  }

  useEffect(() => {
    if (!recordingOpen) return
    const dialog = updateDialogRef.current
    dialog?.querySelector<HTMLElement>('button:not(:disabled), input:not([type="hidden"]):not(:disabled), textarea:not(:disabled)')?.focus()
    const keepFocusInDialog = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setPreview(null)
        setRecordingOpen(false)
        recordTriggerRef.current?.focus()
        return
      }
      if (event.key !== 'Tab' || !dialog) return
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>('button:not(:disabled), input:not([type="hidden"]):not(:disabled), textarea:not(:disabled)'))
      const first = focusable[0]
      const last = focusable.at(-1)
      if (!first || !last) return
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', keepFocusInDialog)
    return () => window.removeEventListener('keydown', keepFocusInDialog)
  }, [recordingOpen])

  const selectPortfolio = (portfolioId: string) => {
    setActivePortfolioId(portfolioId)
    setPortfolioPickerOpen(false)
    const params = new URLSearchParams(searchParams.toString())
    params.set('portfolio', portfolioId)
    router.replace(`${pathname}?${params.toString()}`)
  }

  const openTransactionCorrection = (transaction: PortfolioTransaction) => {
    setStructuredAction(transaction.action as ParsedPortfolioUpdate['action'])
    setEditingTransaction(transaction)
    setUpdateMode('form')
    setNotice('')
    setRecordingOpen(true)
  }

  const removeTransaction = async (transactionId: string) => {
    if (removeArmedId !== transactionId) {
      setRemoveArmedId(transactionId)
      return
    }
    const response = await fetch('/api/markets/portfolio', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'void-portfolio-transaction', transactionId }),
    })
    const payload = await response.json()
    if (!response.ok) {
      setNotice(payload.error ?? 'The ledger entry could not be removed')
      return
    }
    setRemoveArmedId(null)
    setNotice('Ledger entry removed. The original stays in the audit trail.')
    router.refresh()
  }

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
              {portfolios.map((portfolio) => <button key={portfolio.account.id} type="button" role="option" aria-selected={portfolio.account.id === activePortfolio?.account.id} onClick={() => selectPortfolio(portfolio.account.id)}>
                <span>{portfolio.account.name}</span>{portfolio.account.id === activePortfolio?.account.id ? <Check size={15} weight="bold" /> : null}
              </button>)}
            </div> : null}
          </div>
          <button ref={recordTriggerRef} type="button" className="portfolio-record-trigger" aria-haspopup="dialog" aria-expanded={recordingOpen} onClick={openRecording}><Plus size={14} weight="bold" /> Record update</button>
        </div>
      </header>
      <nav className="market-portfolio-tabs" aria-label="Portfolio workflow">
        {([
          ['owned', 'Owned'],
          ['decisions', 'Decisions'],
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
              <p>{activePortfolio.dataSource === 'robinhood'
                ? `Robinhood private account snapshot · captured ${asOf(activePortfolio.dataAsOf ?? universe.dataAsOf)}`
                : `Weighted from the current market snapshot · ${universe.feed === 'illustrative' ? 'Illustrative' : 'Market'} data as of ${asOf(universe.dataAsOf)}`}</p>
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
      {view === 'decisions' ? (
        <div className="portfolio-decision-review-board">
          <header><div><p className="markets-eyebrow">Own · watch · avoid</p><h2>{activePortfolio?.account.name ?? 'Portfolio'} decisions</h2></div><span>{activeDecisions.length} current</span></header>
          {activeDecisions.length === 0 ? <p>No account-specific decisions yet. Open a researched company with an accepted thesis to record one.</p> : activeDecisions.map((decision) => {
            const assessment = constraintByDecision.get(decision.id)
            const review = reviewByDecision.get(decision.id)
            return <article key={decision.id} data-status={decision.constraintStatus}>
              <header><div><MarketsIntentLink href={`/markets/stocks/${decision.symbol}`}><strong>{decision.symbol}</strong></MarketsIntentLink><span>{decision.disposition} · {formatEntryAction(decision.entryAction)} · v{decision.version}</span></div><time>{new Date(decision.createdAt).toLocaleDateString()}</time></header>
              <div className="portfolio-decision-fields">
                <div><span>Valuation support</span><p>{decision.valuationSupport || 'Legacy decision — valuation support was not structured.'}</p></div>
                <div><span>Catalyst and kill</span><p>{decision.nextCatalyst || 'No catalyst recorded.'}</p><small>{decision.killCriteria.map((item) => item.description).join(' · ') || 'No kill criteria recorded.'}</small></div>
                <div><span>What changed</span><p>{decision.whatChanged || decision.changeSummary.join(' ') || 'Legacy decision — change record unavailable.'}</p></div>
                <div><span>Owner sizing policy</span><p>{decision.sizingInputs ? `${decision.sizingInputs.targetWeightPct}% target · ${decision.sizingInputs.maxPositionWeightPct}% position ceiling · ${decision.sizingInputs.maxCorrelatedWeightPct}% ${decision.sizingInputs.correlationGroup} ceiling · ${decision.sizingInputs.maxLiquidityDays} liquidity days` : 'No capital requested for this disposition.'}</p></div>
              </div>
              {assessment ? <div className="portfolio-constraint-checks" data-status={assessment.status}>
                <strong>Constraint review · {assessment.status.replaceAll('_', ' ')}</strong>
                {assessment.checks.map((check) => <p key={check.id} data-status={check.status}><span>{check.label}</span>{check.summary}</p>)}
                <small>Observed {new Date(assessment.dataAsOf).toLocaleString()} · deterministic checks on owner-supplied limits, not a sizing recommendation.</small>
              </div> : <p className="portfolio-legacy-decision">No structured constraint assessment exists for this legacy version.</p>}
              {review ? <div className="portfolio-review-summary"><span>{review.outcome.replaceAll('_', ' ')}</span><p>{review.expectationAssessment}</p><small>{review.lessons}</small></div> : null}
              {reviewingDecisionId === decision.id ? <form className="decision-review-form" onSubmit={(event) => saveReview(event, decision.id, decision.symbol)}>
                <div className="market-form-field"><span>Outcome</span><MarketSelect name="outcome" ariaLabel="Decision outcome" options={[{ value: 'working', label: 'Working' }, { value: 'not_working', label: 'Not working' }, { value: 'invalidated', label: 'Invalidated' }, { value: 'closed', label: 'Closed' }]} /></div>
                <label>Expectation vs outcome<textarea name="expectationAssessment" required placeholder="Did the entry setup and expected mechanism behave as anticipated?" /></label>
                <label>Lessons<textarea name="lessons" required placeholder="What should change in the next decision?" /></label>
                <label>Postmortem<textarea name="postmortem" placeholder="Required when the thesis broke or the position closed" /></label>
                <div><button type="submit">Save review</button><button type="button" onClick={() => setReviewingDecisionId(null)}>Cancel</button></div>
              </form> : <button type="button" onClick={() => setReviewingDecisionId(decision.id)}>{review ? 'Update outcome review' : 'Review entry, break, and outcome'}</button>}
            </article>
          })}
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
          <section className="portfolio-ledger" aria-label="Portfolio ledger">
            <header><div><p className="markets-eyebrow">Quick corrections</p><h2>{activePortfolio?.account.name ?? 'Portfolio'} ledger</h2></div><span>Correct a manual entry or remove it from balances.</span></header>
            {(activePortfolio ? initialData.portfolioTransactions.filter((transaction) => transaction.portfolioId === activePortfolio.account.id && transaction.voidedAt === null).toReversed() : []).length === 0
              ? <p className="portfolio-ledger-empty">No ledger entries yet. Record an update to begin.</p>
              : (activePortfolio ? initialData.portfolioTransactions.filter((transaction) => transaction.portfolioId === activePortfolio.account.id && transaction.voidedAt === null).toReversed() : []).map((transaction) => {
                const editable = transaction.source !== 'import' && transaction.action !== 'position_import'
                const title = transaction.action === 'cash_deposit' ? 'Add cash' : transaction.action === 'cash_withdrawal' ? 'Withdraw cash' : transaction.action
                return <article key={transaction.id} className="portfolio-ledger-entry">
                  <div><strong>{title}</strong><span>{transaction.symbol ? `${transaction.quantity} ${transaction.symbol} at ${formatMoney(transaction.pricePerShare)}` : formatMoney(transaction.pricePerShare)}</span><time>{transaction.occurredAt}</time></div>
                  <p>{transaction.notes || 'No note'}</p>
                  {editable ? <footer><button type="button" onClick={() => openTransactionCorrection(transaction)}><PencilSimple size={13} /> Edit</button><button type="button" className={removeArmedId === transaction.id ? 'portfolio-ledger-remove-armed' : ''} onClick={() => void removeTransaction(transaction.id)}><Trash size={13} />{removeArmedId === transaction.id ? 'Confirm remove' : 'Remove'}</button></footer> : <small>Imported entry · managed outside this ledger</small>}
                </article>
              })}
          </section>
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
                  <div className="market-form-field"><span>Outcome</span><MarketSelect name="outcome" ariaLabel="Decision outcome" options={[{ value: 'working', label: 'Working' }, { value: 'not_working', label: 'Not working' }, { value: 'invalidated', label: 'Invalidated' }, { value: 'closed', label: 'Closed' }]} /></div>
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
        <section ref={updateDialogRef} className="portfolio-update-panel" role="dialog" aria-modal="true" aria-labelledby="portfolio-update-title">
          <header className="portfolio-update-heading">
            <div><p className="markets-eyebrow">{editingTransaction ? 'Correct ledger entry' : 'Record an update'}</p><h2 id="portfolio-update-title">{activePortfolio?.account.name ?? 'Portfolio'}</h2></div>
            <button type="button" className="portfolio-update-close" aria-label="Close record update dialog" onClick={closeRecording}><X size={17} /></button>
          </header>
          <div className="portfolio-update-mode" role="group" aria-label="Update method">
            <button type="button" aria-pressed={updateMode === 'form'} onClick={() => setUpdateMode('form')}>Enter transaction</button>
            {!editingTransaction ? <button type="button" aria-pressed={updateMode === 'language'} onClick={() => setUpdateMode('language')}>Use natural language</button> : null}
          </div>
          {updateMode === 'form' ? <form className="manual-position-form" onSubmit={submitStructuredUpdate}>
            <div className="market-form-field"><span>Action</span><MarketSelect name="transactionAction" value={structuredAction} ariaLabel="Transaction action" onChange={(value) => setStructuredAction(value as ParsedPortfolioUpdate['action'])} options={[{ value: 'buy', label: 'Buy' }, { value: 'sell', label: 'Sell' }, { value: 'cash_deposit', label: 'Add cash' }, { value: 'cash_withdrawal', label: 'Withdraw cash' }]} /></div>
            {structuredActionIsCash ? <label>Cash amount<input name="cashAmount" type="number" step="0.01" min="0.01" required defaultValue={editingTransaction?.pricePerShare ?? ''} /></label> : <>
              <label>Symbol<input name="symbol" maxLength={12} placeholder="NVDA" required defaultValue={editingTransaction?.symbol ?? ''} /></label>
              <label>Shares<input name="quantity" type="number" step="any" min="0.000001" required defaultValue={editingTransaction?.quantity ?? ''} /></label>
              <label>Price / share<input name="pricePerShare" type="number" step="0.0001" min="0.0001" required defaultValue={editingTransaction?.pricePerShare ?? ''} /></label>
              <label>Fees<input name="fees" type="number" step="0.01" min="0" defaultValue={editingTransaction?.fees ?? '0'} /></label>
            </>}
            <label>Date<input name="occurredAt" type="date" required defaultValue={editingTransaction?.occurredAt ?? new Date().toISOString().slice(0, 10)} /></label>
            <label className="portfolio-update-notes">Notes<textarea name="notes" placeholder="Optional reason or context" defaultValue={editingTransaction?.notes ?? ''} /></label>
            <button type="submit" disabled={!activePortfolio}>{editingTransaction ? 'Save correction' : 'Record transaction'}</button>
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

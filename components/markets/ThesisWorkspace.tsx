'use client'

import { type FormEvent, useState } from 'react'
import type {
  InvestmentThesis,
  ThesisEntityType,
  ThesisIntakeDraft,
  ThesisMonitor,
  ThesisMonitorStatus,
  ThesisWorkspaceData,
  MarketThesisWorkspaceData,
} from '@/lib/markets/types'
import { MarketsIntentLink } from './MarketsIntentLink'
import { MarketThesisWorkspace } from './MarketThesisWorkspace'

const emptyDraft: ThesisIntakeDraft = {
  entityType: 'stock',
  symbol: '',
  sector: '',
  subIndustry: '',
  statement: '',
  mispricing: '',
  keyDebate: '',
  fastestKillSignal: '',
}

function title(thesis: InvestmentThesis): string {
  return thesis.entityType === 'stock' ? thesis.symbol ?? thesis.entityKey : thesis.subIndustry ?? thesis.entityKey
}

function label(thesis: InvestmentThesis): string {
  return thesis.entityType === 'stock'
    ? `${thesis.sector ?? 'Stock'} · ${thesis.subIndustry ?? 'Classification pending'}`
    : thesis.sector ?? 'GICS sub-industry'
}

function list(values: string[]) {
  return values.filter(Boolean).slice(0, 3)
}

function checkedLabel(value: string | null): string {
  if (!value) return 'First check pending'
  const formatted = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'America/New_York',
  }).format(new Date(value))
  return `Checked ${formatted} ET`
}

function proposalDate(value: string): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'numeric',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'America/New_York',
  }).format(new Date(value))
}

function coverageLabel(monitor: ThesisMonitor): string {
  const labels: Record<string, string> = {
    price: 'Price',
    material_events: 'Filings & events',
    research: 'Research',
    leadership: 'Industry leadership',
    candidate_scout: 'Candidate Scout',
  }
  return monitor.coverage.map((item) => labels[item] ?? item).join(' · ')
}

function StockDestinationMenu({ symbol }: { symbol: string }) {
  const normalizedSymbol = symbol.toUpperCase()

  return (
    <details className="thesis-stock-destinations">
      <summary aria-label={`Choose a destination for ${normalizedSymbol}`}>
        {normalizedSymbol}<span aria-hidden="true">⌄</span>
      </summary>
      <div className="thesis-stock-destinations-menu">
        <MarketsIntentLink href={`/markets/stocks/${normalizedSymbol}`}>
          Stock page
        </MarketsIntentLink>
        <MarketsIntentLink href={`/markets/stocks/${normalizedSymbol}/research`}>
          Equity research
        </MarketsIntentLink>
      </div>
    </details>
  )
}

export function ThesisWorkspace({ initialData, initialMarketData }: { initialData: ThesisWorkspaceData; initialMarketData?: MarketThesisWorkspaceData }) {
  const [proposals, setProposals] = useState(initialData.proposals)
  const [accepted, setAccepted] = useState(initialData.accepted)
  const [monitors, setMonitors] = useState(initialData.monitors)
  const [busy, setBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState('')
  const [showIntake, setShowIntake] = useState(false)
  const [draft, setDraft] = useState<ThesisIntakeDraft>(emptyDraft)
  const [library, setLibrary] = useState<'market' | 'company'>(initialMarketData ? 'market' : 'company')

  const updateDraft = (field: keyof ThesisIntakeDraft, value: string) => {
    setDraft((current) => ({ ...current, [field]: value }))
  }

  const setEntityType = (entityType: ThesisEntityType) => {
    setDraft((current) => ({ ...current, entityType }))
  }

  const createThesis = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBusy('create')
    setNotice('')
    try {
      const response = await fetch('/api/markets/theses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create', ...draft }),
      })
      const payload = await response.json() as {
        error?: string
        thesis?: InvestmentThesis
        researchQueued?: boolean
        workspace?: ThesisWorkspaceData
      }
      if (!response.ok || !payload.thesis) throw new Error(payload.error ?? 'Unable to capture thesis')
      if (payload.workspace) {
        setProposals(payload.workspace.proposals)
        setAccepted(payload.workspace.accepted)
        setMonitors(payload.workspace.monitors)
      } else {
        setProposals((current) => [
          payload.thesis as InvestmentThesis,
          ...current.filter((item) => item.entityKey !== payload.thesis?.entityKey),
        ])
      }
      setNotice(
        payload.researchQueued
          ? `${title(payload.thesis)} added; full research is queued to enrich it.`
          : `${title(payload.thesis)} added to the review queue.`,
      )
      setDraft(emptyDraft)
      setShowIntake(false)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Unable to capture thesis')
    } finally {
      setBusy(null)
    }
  }

  const review = async (thesis: InvestmentThesis, decision: 'accept' | 'reject') => {
    setBusy(thesis.id)
    setNotice('')
    try {
      const response = await fetch('/api/markets/theses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ thesisId: thesis.id, decision }),
      })
      const payload = await response.json() as { error?: string; workspace?: ThesisWorkspaceData }
      if (!response.ok) throw new Error(payload.error ?? 'Unable to review thesis')
      if (payload.workspace) {
        setProposals(payload.workspace.proposals)
        setAccepted(payload.workspace.accepted)
        setMonitors(payload.workspace.monitors)
      } else {
        setProposals((current) => current.filter((item) => item.id !== thesis.id))
        if (decision === 'accept') {
          setAccepted((current) => [
            { ...thesis, status: 'accepted', reviewedAt: new Date().toISOString() },
            ...current.filter((item) => item.entityKey !== thesis.entityKey),
          ])
        }
      }
      setNotice(decision === 'accept' ? `${title(thesis)} thesis accepted.` : `${title(thesis)} proposal rejected.`)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Unable to review thesis')
    } finally {
      setBusy(null)
    }
  }

  const setMonitorStatus = async (monitor: ThesisMonitor, status: ThesisMonitorStatus) => {
    setBusy(monitor.id)
    setNotice('')
    try {
      const response = await fetch('/api/markets/theses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'set-monitor-status', monitorId: monitor.id, status }),
      })
      const payload = await response.json() as { error?: string; monitor?: ThesisMonitor }
      if (!response.ok || !payload.monitor) throw new Error(payload.error ?? 'Unable to update monitoring')
      const updatedMonitor = payload.monitor
      setMonitors((current) => current.map((item) => item.id === monitor.id ? updatedMonitor : item))
      setNotice(status === 'active' ? 'Thesis monitoring resumed.' : 'Thesis monitoring paused.')
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Unable to update monitoring')
    } finally {
      setBusy(null)
    }
  }

  const monitorByEntity = new Map(monitors.map((monitor) => [monitor.entityKey, monitor]))
  const activeMonitorCount = monitors.filter((monitor) => monitor.status === 'active').length

  return (
    <section className="thesis-workspace">
      <header className="market-explore-heading">
        <div>
          <p className="markets-eyebrow">Evidence-backed and versioned</p>
          <h1 className="markets-display">Theses</h1>
        </div>
        <div className="thesis-heading-actions">
          <span>{proposals.length} awaiting review · {activeMonitorCount} monitored</span>
          <button type="button" onClick={() => { setLibrary('company'); setShowIntake((current) => !current) }}>
            {showIntake ? 'Close intake' : 'New thesis'}
          </button>
        </div>
      </header>
      <nav className="thesis-library-switch" aria-label="Thesis library">
        <button type="button" data-active={library === 'market'} onClick={() => setLibrary('market')}>Market theses</button>
        <button type="button" data-active={library === 'company'} onClick={() => setLibrary('company')}>Company theses</button>
      </nav>
      {library === 'market' ? <MarketThesisWorkspace initialData={initialMarketData ?? { baseline: null, hypotheses: [], theses: [] }} /> : null}

      <div hidden={library !== 'company'}>
      <p className="thesis-intro">A screen can surface a name; a thesis states the belief, what changed, and what would prove it wrong. New evidence creates a proposal—never a silent rewrite.</p>

      {showIntake ? (
        <form className="thesis-intake" data-entity-type={draft.entityType} onSubmit={createThesis}>
          <header>
            <div>
              <p className="markets-eyebrow">Direct intake</p>
              <h2>Capture the view before the full research</h2>
            </div>
            <div className="thesis-intake-kind" aria-label="Thesis type">
              <button type="button" data-active={draft.entityType === 'stock'} onClick={() => setEntityType('stock')}>Stock</button>
              <button type="button" data-active={draft.entityType === 'sub_industry'} onClick={() => setEntityType('sub_industry')}>Industry</button>
            </div>
          </header>
          <p className="thesis-intake-help">This records your view as a proposal immediately. Research can add evidence and revise it later; accepting it turns on monitoring.</p>
          <div className="thesis-intake-grid">
            {draft.entityType === 'stock' ? (
              <label className="thesis-intake-symbol">
                <span>Ticker</span>
                <input
                  required
                  autoCapitalize="characters"
                  maxLength={10}
                  value={draft.symbol}
                  onChange={(event) => updateDraft('symbol', event.target.value.toUpperCase())}
                  placeholder="INTC"
                />
              </label>
            ) : (
              <>
                <label>
                  <span>Sector</span>
                  <input required value={draft.sector} onChange={(event) => updateDraft('sector', event.target.value)} placeholder="Information Technology" />
                </label>
                <label>
                  <span>Industry</span>
                  <input required value={draft.subIndustry} onChange={(event) => updateDraft('subIndustry', event.target.value)} placeholder="Semiconductors" />
                </label>
              </>
            )}
            <label className="thesis-intake-statement">
              <span>What you believe</span>
              <textarea
                required
                minLength={12}
                maxLength={1000}
                value={draft.statement}
                onChange={(event) => updateDraft('statement', event.target.value)}
                placeholder="Intel’s selloff underprices the strategic value of its U.S. fabs and advanced packaging as AI compute demand broadens."
              />
            </label>
            <label className="thesis-intake-mispricing">
              <span>Why the market may be wrong</span>
              <textarea
                maxLength={1000}
                value={draft.mispricing}
                onChange={(event) => updateDraft('mispricing', event.target.value)}
                placeholder="The market is focused on near-term foundry losses and execution risk, not the value of domestic capacity if demand and policy support compound."
              />
            </label>
            <label>
              <span>Key debate <small>optional</small></span>
              <input
                maxLength={500}
                value={draft.keyDebate}
                onChange={(event) => updateDraft('keyDebate', event.target.value)}
                placeholder="Can foundry utilization improve before cash burn overwhelms the upside?"
              />
            </label>
            <label>
              <span>Fastest disconfirming evidence <small>optional</small></span>
              <input
                maxLength={500}
                value={draft.fastestKillSignal}
                onChange={(event) => updateDraft('fastestKillSignal', event.target.value)}
                placeholder="Another major process delay with no external foundry wins."
              />
            </label>
          </div>
          <footer>
            <span>Saved as proposed · confidence starts neutral</span>
            <button type="submit" disabled={busy === 'create'}>{busy === 'create' ? 'Capturing…' : 'Add to review queue'}</button>
          </footer>
        </form>
      ) : null}

      <section className="thesis-review-queue" aria-labelledby="thesis-review-title">
        <header>
          <div><p className="markets-eyebrow">Review queue</p><h2 id="thesis-review-title">Proposed updates</h2></div>
          <span>{proposals.length} open</span>
        </header>
        {proposals.length === 0 ? <p className="thesis-empty">No updates need review. A completed research run, a material event, or a new industry leadership signal will create the next proposal.</p> : (
          <div className="thesis-proposal-list">
            {proposals.map((thesis) => (
              <article key={thesis.id} className="thesis-proposal">
                <header className="thesis-proposal-identity">
                  <div><span>{thesis.entityType === 'stock' ? 'Stock thesis' : 'Industry thesis'}</span><h3>{thesis.symbol ? <StockDestinationMenu symbol={thesis.symbol} /> : title(thesis)}</h3><small>{label(thesis)}<br />proposed v{thesis.version}</small></div>
                  <time dateTime={thesis.generatedAt}>{proposalDate(thesis.generatedAt)}</time>
                </header>
                <div className="thesis-proposal-copy">
                  <span>Thesis</span>
                  <strong>{thesis.content.headline}</strong>
                  {thesis.content.summary ? <><small>Why it may be mispriced</small><p>{thesis.content.summary}</p></> : null}
                </div>
                <dl>
                  {thesis.content.keyDebate ? <div><dt>Key debate</dt><dd>{thesis.content.keyDebate}</dd></div> : null}
                  <div><dt>Fastest disconfirming evidence</dt><dd>{thesis.content.fastestKillSignal || 'Not defined yet.'}</dd></div>
                </dl>
                <footer>
                  <span><strong>Changed:</strong> {thesis.content.whatChanged} · {thesis.sources.length} linked source{thesis.sources.length === 1 ? '' : 's'} · {thesis.trigger.replaceAll('-', ' ')}</span>
                  <div><button type="button" onClick={() => review(thesis, 'reject')} disabled={busy === thesis.id}>Reject</button><button type="button" onClick={() => review(thesis, 'accept')} disabled={busy === thesis.id}>{busy === thesis.id ? 'Saving…' : 'Accept thesis'}</button></div>
                </footer>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="thesis-library" aria-labelledby="thesis-library-title">
        <header><div><p className="markets-eyebrow">Current view</p><h2 id="thesis-library-title">Accepted theses</h2></div><span>{accepted.length} active</span></header>
        {accepted.length === 0 ? <p className="thesis-empty">Accept a proposal to establish the first durable view. The version history will preserve every later change.</p> : (
          <div className="thesis-library-grid">
            {accepted.map((thesis) => {
              const monitor = monitorByEntity.get(thesis.entityKey)
              return <article key={thesis.id} className="thesis-library-item">
                <header><div><span>{thesis.entityType === 'stock' ? 'Stock' : 'Industry'}</span><h3>{thesis.symbol ? <StockDestinationMenu symbol={thesis.symbol} /> : title(thesis)}</h3></div><small>v{thesis.version}</small></header>
                <strong className="thesis-library-statement">{thesis.content.headline}</strong>
                <p>{thesis.content.summary}</p>
                {monitor ? (
                    <div className="thesis-monitor-strip" data-status={monitor.status}>
                      <div>
                        <strong>{monitor.status === 'active' ? 'Monitoring active' : 'Monitoring paused'}</strong>
                        <span>{coverageLabel(monitor)}</span>
                      </div>
                      <div>
                        <small>{checkedLabel(monitor.lastCheckedAt)}</small>
                        <button
                          type="button"
                          disabled={busy === monitor.id}
                          onClick={() => setMonitorStatus(monitor, monitor.status === 'active' ? 'paused' : 'active')}
                        >
                          {monitor.status === 'active' ? 'Pause' : 'Resume'}
                        </button>
                      </div>
                    </div>
                ) : <div className="thesis-monitor-strip" data-status="pending"><strong>Monitoring setup pending</strong></div>}
                <div className="thesis-list-columns">
                  <div><span>Catalysts</span>{list(thesis.content.catalysts).map((item) => <p key={item}>{item}</p>)}</div>
                  <div><span>Invalidation</span>{list(thesis.content.invalidation).map((item) => <p key={item}>{item}</p>)}</div>
                </div>
                {thesis.symbol ? null : <small>{label(thesis)}</small>}
              </article>
            })}
          </div>
        )}
      </section>
      {notice ? <p className="thesis-notice" role="status">{notice}</p> : null}
      </div>
    </section>
  )
}

'use client'

import { type FormEvent, useState } from 'react'
import { Check, Pause, Play, Plus, Pulse, X } from '@phosphor-icons/react'
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

function countLabel(value: number, singular: string, plural = `${singular}s`) {
  return `${value} ${value === 1 ? singular : plural}`
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
      setNotice(payload.researchQueued ? `${title(payload.thesis)} is in review; research is queued to enrich it.` : `${title(payload.thesis)} is in the review queue.`)
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
      setNotice(decision === 'accept' ? `${title(thesis)} is now an active company thesis.` : `${title(thesis)} proposal rejected.`)
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
      setMonitors((current) => current.map((item) => item.id === monitor.id ? payload.monitor as ThesisMonitor : item))
      setNotice(status === 'active' ? 'Thesis monitoring resumed.' : 'Thesis monitoring paused.')
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Unable to update monitoring')
    } finally {
      setBusy(null)
    }
  }

  const monitorByEntity = new Map(monitors.map((monitor) => [monitor.entityKey, monitor]))
  const activeMonitorCount = monitors.filter((monitor) => monitor.status === 'active').length

  return <section className="thesis-workspace">
    <header className="market-explore-heading thesis-workspace-heading">
      <div><p className="markets-eyebrow">Evidence, conviction, and revision</p><h1 className="markets-display">Theses</h1></div>
      <div className="thesis-workspace-actions"><span>{countLabel(proposals.length, 'review')} · {countLabel(activeMonitorCount, 'active monitor')}</span><button type="button" onClick={() => { setLibrary('company'); setShowIntake((current) => !current) }}><Plus size={14} weight="bold" /> {showIntake ? 'Close intake' : 'New thesis'}</button></div>
    </header>

    <nav className="thesis-workspace-tabs" aria-label="Thesis library">
      <button type="button" aria-current={library === 'market' ? 'page' : undefined} onClick={() => setLibrary('market')}>Market models</button>
      <button type="button" aria-current={library === 'company' ? 'page' : undefined} onClick={() => setLibrary('company')}>Company theses</button>
    </nav>

    {library === 'market' ? <MarketThesisWorkspace initialData={initialMarketData ?? { baseline: null, hypotheses: [], theses: [], frontiers: [], crossDomainLinks: [] }} /> : null}

    {library === 'company' ? <div className="company-thesis-workspace">
      <section className="thesis-context-strip" aria-label="Company thesis context"><Pulse size={16} weight="bold" aria-hidden="true" /><p>A company thesis is an explicit belief about a security, its mispricing, and the fastest evidence that could disprove it.</p><span>Review activates monitoring; no revision silently replaces the current view.</span></section>

      {showIntake ? <ThesisIntake draft={draft} busy={busy} setEntityType={setEntityType} updateDraft={updateDraft} onSubmit={createThesis} /> : null}
      <ProposalQueue proposals={proposals} busy={busy} onReview={review} />
      <AcceptedTheses accepted={accepted} monitors={monitorByEntity} busy={busy} onMonitorChange={setMonitorStatus} />
      {notice ? <p className="thesis-notice" role="status">{notice}</p> : null}
    </div> : null}
  </section>
}

function ThesisIntake({ draft, busy, setEntityType, updateDraft, onSubmit }: { draft: ThesisIntakeDraft; busy: string | null; setEntityType: (entityType: ThesisEntityType) => void; updateDraft: (field: keyof ThesisIntakeDraft, value: string) => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  return <form className="thesis-intake" data-entity-type={draft.entityType} onSubmit={onSubmit}>
    <header><div><p className="markets-eyebrow">New company thesis</p><h2>Record the view before the research</h2><p>It enters review immediately; full research can add evidence but cannot overwrite it.</p></div><div className="thesis-intake-kind" aria-label="Thesis type"><button type="button" data-active={draft.entityType === 'stock'} onClick={() => setEntityType('stock')}>Stock</button><button type="button" data-active={draft.entityType === 'sub_industry'} onClick={() => setEntityType('sub_industry')}>Industry</button></div></header>
    <div className="thesis-intake-grid">
      {draft.entityType === 'stock' ? <label className="thesis-intake-symbol"><span>Ticker</span><input required autoCapitalize="characters" maxLength={10} value={draft.symbol} onChange={(event) => updateDraft('symbol', event.target.value.toUpperCase())} placeholder="INTC" /></label> : <><label><span>Sector</span><input required value={draft.sector} onChange={(event) => updateDraft('sector', event.target.value)} placeholder="Information Technology" /></label><label><span>Industry</span><input required value={draft.subIndustry} onChange={(event) => updateDraft('subIndustry', event.target.value)} placeholder="Semiconductors" /></label></>}
      <label className="thesis-intake-statement"><span>What you believe</span><textarea required minLength={12} maxLength={1000} value={draft.statement} onChange={(event) => updateDraft('statement', event.target.value)} placeholder="Intel’s selloff underprices the strategic value of its U.S. fabs and advanced packaging as AI compute demand broadens." /></label>
      <label className="thesis-intake-mispricing"><span>Why the market may be wrong</span><textarea maxLength={1000} value={draft.mispricing} onChange={(event) => updateDraft('mispricing', event.target.value)} placeholder="The market is focused on near-term foundry losses and execution risk, not the value of domestic capacity if demand and policy support compound." /></label>
      <label><span>Key debate <small>Optional</small></span><input maxLength={500} value={draft.keyDebate} onChange={(event) => updateDraft('keyDebate', event.target.value)} placeholder="Can utilization improve before cash burn overwhelms the upside?" /></label>
      <label><span>Fastest disconfirming evidence <small>Optional</small></span><input maxLength={500} value={draft.fastestKillSignal} onChange={(event) => updateDraft('fastestKillSignal', event.target.value)} placeholder="Another major process delay with no external foundry wins." /></label>
    </div>
    <footer><span>Saved as a proposal · confidence begins neutral</span><button type="submit" disabled={busy === 'create'}>{busy === 'create' ? 'Capturing…' : 'Add to review'}</button></footer>
  </form>
}

function ProposalQueue({ proposals, busy, onReview }: { proposals: InvestmentThesis[]; busy: string | null; onReview: (thesis: InvestmentThesis, decision: 'accept' | 'reject') => Promise<void> }) {
  return <section className="company-thesis-review" aria-labelledby="thesis-review-title">
    <header className="thesis-section-heading"><div><p className="markets-eyebrow">Review queue</p><h2 id="thesis-review-title">Views waiting on a decision</h2></div><span>{countLabel(proposals.length, 'proposal')}</span></header>
    {proposals.length === 0 ? <EmptyCompanyState title="Nothing needs review right now." detail="A completed research run or a directly captured view will show up here." /> : <div className="company-thesis-review-rows">{proposals.map((thesis) => <article key={thesis.id}>
      <div className="company-thesis-identity"><span className="thesis-status-pill" data-status="proposed">proposed · v{thesis.version}</span><h3>{thesis.symbol ? <StockDestinationMenu symbol={thesis.symbol} /> : title(thesis)}</h3><small>{label(thesis)} · {proposalDate(thesis.generatedAt)}</small></div>
      <div className="company-thesis-statement"><strong>{thesis.content.headline}</strong><details className="company-thesis-evidence"><summary>Review evidence</summary><div>{thesis.content.summary ? <p>{thesis.content.summary}</p> : null}<dl><div><dt>Key debate</dt><dd>{thesis.content.keyDebate || 'Not defined yet.'}</dd></div><div><dt>Fastest disconfirming evidence</dt><dd>{thesis.content.fastestKillSignal || 'Not defined yet.'}</dd></div></dl></div></details></div>
      <footer><small>{thesis.sources.length} linked source{thesis.sources.length === 1 ? '' : 's'} · {thesis.trigger.replaceAll('-', ' ')}</small><div><button type="button" className="thesis-quiet-action" onClick={() => void onReview(thesis, 'reject')} disabled={busy === thesis.id}><X size={13} weight="bold" /> Reject</button><button type="button" className="thesis-primary-action" onClick={() => void onReview(thesis, 'accept')} disabled={busy === thesis.id}><Check size={13} weight="bold" /> {busy === thesis.id ? 'Saving…' : 'Accept thesis'}</button></div></footer>
    </article>)}</div>}
  </section>
}

function AcceptedTheses({ accepted, monitors, busy, onMonitorChange }: { accepted: InvestmentThesis[]; monitors: Map<string, ThesisMonitor>; busy: string | null; onMonitorChange: (monitor: ThesisMonitor, status: ThesisMonitorStatus) => Promise<void> }) {
  return <section className="company-thesis-library" aria-labelledby="thesis-library-title">
    <header className="thesis-section-heading"><div><p className="markets-eyebrow">Active company views</p><h2 id="thesis-library-title">The current book</h2></div><span>{countLabel(accepted.length, 'active thesis', 'active theses')}</span></header>
    {accepted.length === 0 ? <EmptyCompanyState title="No company thesis is active yet." detail="Accept a reviewed proposal to establish a durable view and turn on monitoring." /> : <div className="company-thesis-active-list">{accepted.map((thesis) => {
      const monitor = monitors.get(thesis.entityKey)
      return <article key={thesis.id}>
        <header><div><span className="thesis-status-pill" data-status="active">active · v{thesis.version}</span><h3>{thesis.symbol ? <StockDestinationMenu symbol={thesis.symbol} /> : title(thesis)}</h3><small>{label(thesis)}</small></div><MonitorControl monitor={monitor} busy={busy} onChange={onMonitorChange} /></header>
        <div className="company-thesis-active-body"><div><strong>{thesis.content.headline}</strong>{thesis.content.summary ? <p>{thesis.content.summary}</p> : null}</div><div className="company-thesis-active-evidence"><EvidenceList label="Catalysts" items={list(thesis.content.catalysts)} empty="No catalyst retained." /><EvidenceList label="Invalidation" items={list(thesis.content.invalidation)} empty={thesis.content.fastestKillSignal || 'No invalidation retained.'} /></div></div>
      </article>
    })}</div>}
  </section>
}

function MonitorControl({ monitor, busy, onChange }: { monitor: ThesisMonitor | undefined; busy: string | null; onChange: (monitor: ThesisMonitor, status: ThesisMonitorStatus) => Promise<void> }) {
  if (!monitor) return <div className="company-thesis-monitor" data-status="pending"><span>Monitoring</span><strong>Setup pending</strong></div>
  const active = monitor.status === 'active'
  return <div className="company-thesis-monitor" data-status={monitor.status}><span>Monitoring</span><strong>{active ? 'Active' : 'Paused'}</strong><small>{coverageLabel(monitor)} · {checkedLabel(monitor.lastCheckedAt)}</small><button type="button" disabled={busy === monitor.id} onClick={() => void onChange(monitor, active ? 'paused' : 'active')}>{active ? <Pause size={12} weight="fill" /> : <Play size={12} weight="fill" />}{active ? 'Pause' : 'Resume'}</button></div>
}

function EvidenceList({ label, items, empty }: { label: string; items: string[]; empty: string }) {
  return <div><span>{label}</span>{items.length ? <ul>{items.map((item) => <li key={item}>{item}</li>)}</ul> : <p>{empty}</p>}</div>
}

function EmptyCompanyState({ title, detail }: { title: string; detail: string }) {
  return <div className="thesis-empty-state"><strong>{title}</strong><span>{detail}</span></div>
}

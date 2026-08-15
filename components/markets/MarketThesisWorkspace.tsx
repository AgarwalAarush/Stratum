'use client'

import { useState } from 'react'
import { ArrowRight, CaretDown, CheckCircle, ClockCounterClockwise, Pulse } from '@phosphor-icons/react'
import type { MarketHypothesis, MarketHypothesisCrossDomainLink, MarketResearchFrontierItem, MarketThesisVersion, MarketThesisWorkspaceData, ThesisPrediction } from '@/lib/markets/types'

type Action = 'freeze' | 'reject' | 'archive' | 'reactivate' | 'request_deepening'

function dateLabel(value: string) {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/New_York' }).format(new Date(value))
}

function actionLabel(hypothesis: MarketHypothesis): { action: Action; label: string } {
  if (hypothesis.status === 'archived' || hypothesis.status === 'rejected') return { action: 'reactivate', label: 'Reactivate' }
  if (hypothesis.status === 'active') return { action: 'freeze', label: 'Freeze revisions' }
  return { action: 'request_deepening', label: 'Deepen research' }
}

function countLabel(value: number, singular: string, plural = `${singular}s`) {
  return `${value} ${value === 1 ? singular : plural}`
}

export function MarketThesisWorkspace({ initialData }: { initialData: MarketThesisWorkspaceData }) {
  const [data, setData] = useState(initialData)
  const [busy, setBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState('')
  const [queuedExposureIds, setQueuedExposureIds] = useState<Set<string>>(() => new Set())
  const [selectedId, setSelectedId] = useState(initialData.theses.find((item) => item.state === 'active' || item.state === 'weakened')?.id ?? '')

  const takeAction = async (hypothesis: MarketHypothesis, action: Action) => {
    setBusy(`${hypothesis.id}:${action}`)
    setNotice('')
    try {
      const response = await fetch(`/api/markets/market-theses/${hypothesis.id}/actions`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }),
      })
      const payload = await response.json() as { error?: string; queued?: boolean }
      if (!response.ok) throw new Error(payload.error ?? 'Unable to update market thesis')
      if (action === 'freeze' || action === 'reactivate') {
        setData((current) => ({ ...current, hypotheses: current.hypotheses.map((item) => item.id === hypothesis.id ? { ...item, status: action === 'freeze' ? 'proposed' : 'active' } : item) }))
      }
      if (action === 'reject' || action === 'archive') {
        setData((current) => ({ ...current, hypotheses: current.hypotheses.map((item) => item.id === hypothesis.id ? { ...item, status: action === 'reject' ? 'rejected' : 'archived' } : item) }))
      }
      setNotice(payload.queued ? 'Research is queued. The published thesis stays unchanged until its evidence clears review.' : 'Market thesis state updated.')
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Unable to update market thesis')
    } finally {
      setBusy(null)
    }
  }

  const investigateExposure = async (thesis: MarketThesisVersion, exposureId: string) => {
    const key = `investigate:${thesis.id}:${exposureId}`
    setBusy(key)
    setNotice('')
    try {
      const response = await fetch(`/api/markets/market-theses/${thesis.hypothesisId}/exposures/${exposureId}/investigate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ marketThesisVersionId: thesis.id }),
      })
      const payload = await response.json() as { error?: string; symbol?: string; deduplicated?: boolean }
      if (!response.ok) throw new Error(payload.error ?? 'Unable to queue company research')
      setQueuedExposureIds((current) => new Set([...current, exposureId]))
      setNotice(payload.deduplicated
        ? `${payload.symbol ?? 'Company'} research is already queued. The resulting proposal will remain separate from this market model.`
        : `${payload.symbol ?? 'Company'} research is queued. It must independently verify the value-chain role before creating a proposal.`)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Unable to queue company research')
    } finally {
      setBusy(null)
    }
  }

  const published = data.theses.filter((item) => item.state === 'active' || item.state === 'weakened')
  const selected = published.find((item) => item.id === selectedId) ?? published[0] ?? null
  const selectedHypothesis = selected ? data.hypotheses.find((item) => item.id === selected.hypothesisId) ?? null : null
  const forming = data.hypotheses.filter((item) => ['dormant', 'forming', 'proposed'].includes(item.status))
  const history = data.hypotheses.filter((item) => ['rejected', 'archived'].includes(item.status))
  const hypothesesById = new Map(data.hypotheses.map((item) => [item.id, item]))
  const pendingPredictions = published.flatMap((item) => item.predictions).filter((item) => item.result === 'pending').length

  return <div className="market-thesis-workspace">
    <section className="thesis-context-strip" aria-label="Market thesis context">
      <Pulse size={16} weight="bold" aria-hidden="true" />
      <p>Market models map the transmission mechanism. Company research determines whether a security captures it; portfolio decisions remain separate.</p>
      <span>{countLabel(published.length, 'live model')} · {countLabel(pendingPredictions, 'open prediction')}</span>
    </section>

    <section className="market-thesis-baseline" aria-labelledby="global-baseline-title">
      <header>
        <div>
          <p className="markets-eyebrow">World baseline</p>
          <h2 id="global-baseline-title">What the system is watching</h2>
        </div>
        {data.baseline ? <span className="thesis-status-pill" data-status={data.baseline.freshness}><CheckCircle size={13} weight="fill" /> {data.baseline.freshness}</span> : null}
      </header>
      {data.baseline ? <>
        <p className="market-thesis-baseline-state">{data.baseline.content.state}</p>
        <div className="market-thesis-baseline-columns">
          <BaselineColumn title="What changed" items={data.baseline.content.changes} />
          <BaselineColumn title="Constraints" items={data.baseline.content.constraints} empty="No active constraint has been retained." />
          <BaselineColumn title="Open questions" items={data.baseline.content.openQuestions} empty="No open question is blocking the baseline." />
        </div>
        <footer>Evidence as of {dateLabel(data.baseline.dataAsOf)} · v{data.baseline.version} · {countLabel(data.baseline.diff.length, 'material change')}</footer>
      </> : <EmptyState title="The world baseline has not published yet." detail="Ingestion can continue safely while automatic promotion stays off." />}
    </section>

    <section className="market-thesis-library" aria-labelledby="published-market-theses-title">
      <header className="thesis-section-heading">
        <div><p className="markets-eyebrow">Published market models</p><h2 id="published-market-theses-title">The current case</h2></div>
        <span>{countLabel(published.length, 'model')}</span>
      </header>
      {selected ? <div className="market-thesis-browser">
        <nav className="market-thesis-index" aria-label="Published market models">
          {published.map((thesis) => <button key={thesis.id} type="button" aria-current={thesis.id === selected.id ? 'page' : undefined} onClick={() => setSelectedId(thesis.id)}>
            <span className="market-thesis-index-status" data-state={thesis.state}>{thesis.state}</span>
            <strong>{thesis.title}</strong>
            <small>v{thesis.version} · {Math.round(thesis.confidence)}% confidence</small>
          </button>)}
        </nav>
        <MarketThesisDetail thesis={selected} hypothesis={selectedHypothesis} busy={busy} queuedExposureIds={queuedExposureIds} onAction={takeAction} onInvestigate={investigateExposure} />
      </div> : <EmptyState title="No model has cleared the publication gate." detail="A compelling narrative is insufficient without a fresh factual core, an independent cross-check, a counter-case, and predictions." />}
    </section>

    {forming.length > 0 ? <ResearchQueue hypotheses={forming} frontiers={data.frontiers} busy={busy} onAction={takeAction} /> : null}
    <CrossDomainMap links={data.crossDomainLinks} hypothesesById={hypothesesById} />
    {history.length > 0 ? <Archive history={history} frontiers={data.frontiers} busy={busy} onAction={takeAction} /> : null}
    {notice ? <p className="thesis-notice" role="status">{notice}</p> : null}
  </div>
}

function BaselineColumn({ title, items, empty }: { title: string; items: string[]; empty?: string }) {
  return <div>
    <span>{title}</span>
    {items.length > 0 ? <ul>{items.slice(0, 3).map((item) => <li key={item}>{item}</li>)}</ul> : <p>{empty}</p>}
  </div>
}

function EmptyState({ title, detail }: { title: string; detail: string }) {
  return <div className="thesis-empty-state"><strong>{title}</strong><span>{detail}</span></div>
}

function MarketThesisDetail({ thesis, hypothesis, busy, queuedExposureIds, onAction, onInvestigate }: { thesis: MarketThesisVersion; hypothesis: MarketHypothesis | null; busy: string | null; queuedExposureIds: Set<string>; onAction: (hypothesis: MarketHypothesis, action: Action) => Promise<void>; onInvestigate: (thesis: MarketThesisVersion, exposureId: string) => Promise<void> }) {
  const primary = hypothesis ? actionLabel(hypothesis) : null
  const sources = [...new Map(thesis.content.sourceLedger.map((source) => [`${source.label}:${source.url}`, source])).values()]
  const verifiedExposures = thesis.exposures.filter((item) => item.verificationStatus === 'verified')
  const companyResearchLeads = thesis.exposures.filter((item) => item.symbol && item.verificationStatus !== 'unverified')
  const unresolvedExposures = thesis.exposures.filter((item) => !item.symbol)
  return <article className="market-thesis-detail" data-state={thesis.state}>
    <header>
      <div><span className="thesis-status-pill" data-status={thesis.state}>{thesis.state} · v{thesis.version}</span><h3>{thesis.title}</h3></div>
      <div className="market-thesis-detail-confidence"><strong>{Math.round(thesis.confidence)}%</strong><span>research confidence</span></div>
    </header>
    <p className="market-thesis-detail-summary">{thesis.content.whyNow}</p>
    <div className="market-thesis-detail-grid">
      <DetailBlock label="Economic capture" content={thesis.content.economics} />
      <div className="market-thesis-capture-ledger" data-status={thesis.content.economicCapture.status}>
        <span>Capture test · {thesis.content.economicCapture.status.replaceAll('_', ' ')}</span>
        <p><strong>Rent recipients</strong>{thesis.content.economicCapture.rentRecipients.join(' · ') || 'Not established'}</p>
        <p><strong>Commoditized</strong>{thesis.content.economicCapture.commoditizedLayers.join(' · ') || 'Not established'}</p>
        <p><strong>Durability</strong>{thesis.content.economicCapture.durabilityDrivers.join(' · ') || 'Not established'}</p>
        <p><strong>Breaks capture</strong>{thesis.content.economicCapture.breakConditions.join(' · ') || 'Not established'}</p>
      </div>
      <DetailBlock label="What may be priced" content={thesis.content.expectations} />
      <DetailList label="Falsifiers" items={thesis.content.falsifiers} empty="No explicit falsifier has been retained." />
      <PredictionLedger predictions={thesis.predictions} />
    </div>
    {verifiedExposures.length > 0 ? <section className="market-thesis-exposure-ledger" aria-label="Verified value-chain exposures">
      <span>Value-chain exposures</span>
      <div>{verifiedExposures.map((item) => <p key={item.id}><strong>{item.symbol ?? item.entityName}</strong><span>{item.mechanism}</span></p>)}</div>
    </section> : null}
    {companyResearchLeads.length > 0 ? <section className="market-thesis-company-leads" aria-label="Company research leads">
      <header><span>Public-company research candidates</span><small>Source-attributed nomination · not a recommendation</small></header>
      <div>{companyResearchLeads.map((item) => {
        const queued = queuedExposureIds.has(item.id) || Boolean(item.researchQueuedAt)
        const investigating = busy === `investigate:${thesis.id}:${item.id}`
        return <article key={item.id}>
          <div><strong><a href={`/markets/stocks/${item.symbol}`}>{item.symbol}</a></strong><span>{item.role} · materiality {Math.round(item.materiality)} · confidence {Math.round(item.confidence)}</span><p>{item.mechanism}</p>{item.resolutionReason ? <small>{item.resolutionReason}</small> : null}</div>
          <button type="button" disabled={busy !== null || queued} onClick={() => void onInvestigate(thesis, item.id)}>{investigating ? 'Queueing…' : queued ? 'Research queued' : 'Investigate company'}</button>
        </article>
      })}</div>
    </section> : null}
    {unresolvedExposures.length > 0 ? <details className="market-thesis-unresolved-exposures"><summary>{countLabel(unresolvedExposures.length, 'unresolved value-chain exposure')}</summary><div>{unresolvedExposures.map((item) => <p key={item.id}><strong>{item.entityName}</strong><span>{item.mechanism}</span></p>)}</div><small>No ticker is shown until the bounded ledger identifies a company and the active-asset registry verifies its symbol.</small></details> : null}
    {thesis.linkedCompanyTheses.length > 0 ? <section className="market-thesis-company-lineage" aria-label="Linked company thesis history">
      <header><span>Independent company-thesis outcomes</span><small>All linked versions · market context does not validate them</small></header>
      <div>{[...thesis.linkedCompanyTheses].sort((left, right) => right.version - left.version).map((companyThesis) => <article key={companyThesis.id}>
        <div><strong>{companyThesis.symbol ?? 'Company thesis'} · v{companyThesis.version}</strong><span>{companyThesis.status} · {companyThesis.trigger.replaceAll('-', ' ')}</span><p>{companyThesis.headline || 'No headline retained.'}</p></div>
        {companyThesis.symbol ? <a href={`/markets/stocks/${companyThesis.symbol}/research`}>Open research</a> : null}
      </article>)}</div>
    </section> : null}
    <footer>
      {sources.length > 0 ? <details className="market-thesis-source-ledger"><summary>{countLabel(sources.length, 'source')}</summary><div>{sources.map((source) => <a key={`${source.label}:${source.url}`} href={source.url} target="_blank" rel="noreferrer">{source.label}<ArrowRight size={12} aria-hidden="true" /></a>)}</div></details> : <span />}
      <div className="market-thesis-detail-actions">
        <small>Generated {dateLabel(thesis.generatedAt)}{thesis.revisionDiff.length ? ` · ${thesis.revisionDiff[0]}` : ''}</small>
        {hypothesis && primary ? <button type="button" disabled={busy !== null} onClick={() => void onAction(hypothesis, primary.action)}>{busy === `${hypothesis.id}:${primary.action}` ? 'Saving…' : primary.label}</button> : null}
      </div>
    </footer>
  </article>
}

function DetailBlock({ label, content }: { label: string; content: string }) {
  return <div className="market-thesis-detail-block"><span>{label}</span><p>{content}</p></div>
}

function DetailList({ label, items, empty }: { label: string; items: string[]; empty: string }) {
  return <div className="market-thesis-detail-block"><span>{label}</span>{items.length ? <ul>{items.map((item) => <li key={item}>{item}</li>)}</ul> : <p>{empty}</p>}</div>
}

function PredictionLedger({ predictions }: { predictions: ThesisPrediction[] }) {
  return <div className="market-thesis-detail-block"><span>Predictions</span>{predictions.length ? <div className="market-thesis-predictions">{predictions.map((prediction) => <div key={prediction.id}><p>{prediction.prediction}</p><small>{prediction.result}{prediction.deadline ? ` · due ${dateLabel(prediction.deadline)}` : ''}</small>{prediction.latestEvaluation ? <small>{prediction.latestEvaluation.status === 'complete' ? `${prediction.latestEvaluation.verdict} · evaluator v${prediction.latestEvaluation.version}` : prediction.latestEvaluation.error || 'Evaluation is processing.'}</small> : <small>Awaiting a due date or new linked evidence before evaluation.</small>}</div>)}</div> : <p>No prediction has been recorded yet.</p>}</div>
}

function frontierStatus(item: MarketResearchFrontierItem) {
  if (item.status === 'deferred' && item.adapterId?.startsWith('world-source-scout:')) return 'Candidate discovery awaiting review'
  if (item.status === 'evidence_received') return 'Governed evidence received — analyst revision pending'
  if (item.status === 'blocked') return 'Blocked pending a permitted source path'
  if (item.status === 'complete') return 'Evidence gap resolved'
  return 'Awaiting bounded research routing'
}

function ResearchQueue({ hypotheses, frontiers, busy, onAction }: { hypotheses: MarketHypothesis[]; frontiers: MarketResearchFrontierItem[]; busy: string | null; onAction: (hypothesis: MarketHypothesis, action: Action) => Promise<void> }) {
  return <section className="market-thesis-research-queue" aria-labelledby="research-queue-title">
    <header className="thesis-section-heading"><div><p className="markets-eyebrow">Research queue</p><h2 id="research-queue-title">Models still under review</h2></div><span>{countLabel(hypotheses.length, 'model')}</span></header>
    {hypotheses.length ? <div className="market-thesis-research-rows">{hypotheses.map((hypothesis) => {
      const research = hypothesis.latestResearch
      const ownFrontiers = frontiers.filter((item) => item.hypothesisId === hypothesis.id)
      const priorityFrontier = ownFrontiers[0]
      const primary = actionLabel(hypothesis)
      return <article key={hypothesis.id}>
        <div><span className="thesis-status-pill" data-status={hypothesis.status}>{hypothesis.status}</span><h3>{hypothesis.title}</h3><p>{hypothesis.coreMechanism}</p></div>
        <dl><div><dt>Counter-case</dt><dd>{hypothesis.counterThesis}</dd></div><div><dt>Evidence</dt><dd>{countLabel(hypothesis.evidence.length, 'linked observation')} · {countLabel(ownFrontiers.length, 'open research gap')}</dd></div></dl>
        <footer><small>{research ? `Research v${research.version} · ${research.status.replaceAll('_', ' ')}` : 'No durable analysis yet'}{priorityFrontier ? ` · ${frontierStatus(priorityFrontier)}` : ''}. New leads remain outside the evidence ledger until contract, health, and human approval are complete.</small><button type="button" disabled={busy !== null} onClick={() => void onAction(hypothesis, primary.action)}>{busy === `${hypothesis.id}:${primary.action}` ? 'Saving…' : primary.label}</button></footer>
      </article>
    })}</div> : <EmptyState title="Nothing is waiting on a research decision." detail="New signal clusters will appear here before they can become published market models." />}
  </section>
}

function CrossDomainMap({ links, hypothesesById }: { links: MarketHypothesisCrossDomainLink[]; hypothesesById: Map<string, MarketHypothesis> }) {
  if (links.length === 0) return null
  return <details className="market-thesis-transmission">
    <summary><strong>Cross-domain mechanism map</strong><small>{countLabel(links.length, 'link')} · Forming links are research context only</small><CaretDown size={15} aria-hidden="true" /></summary>
    <div>{links.map((link) => <article key={link.id}><span>{link.relationship}</span><strong>{hypothesesById.get(link.fromHypothesisId)?.title ?? 'Source model'}<ArrowRight size={14} aria-hidden="true" />{hypothesesById.get(link.toHypothesisId)?.title ?? 'Destination model'}</strong><p>{link.explanation}</p><small>{countLabel(link.sourceObservationIds.length, 'linked observation')} · {Math.round(link.confidence)}% confidence</small></article>)}</div>
  </details>
}

function Archive({ history, frontiers, busy, onAction }: { history: MarketHypothesis[]; frontiers: MarketResearchFrontierItem[]; busy: string | null; onAction: (hypothesis: MarketHypothesis, action: Action) => Promise<void> }) {
  return <details className="market-thesis-archive"><summary><span><ClockCounterClockwise size={15} aria-hidden="true" /> Preserved history</span><small>{countLabel(history.length, 'archived or rejected model')}</small><CaretDown size={15} aria-hidden="true" /></summary><div>{history.map((hypothesis) => <article key={hypothesis.id}><div><span className="thesis-status-pill" data-status={hypothesis.status}>{hypothesis.status}</span><strong>{hypothesis.title}</strong><p>{hypothesis.coreMechanism}</p></div><small>{countLabel(frontiers.filter((item) => item.hypothesisId === hypothesis.id).length, 'open research gap')}</small><button type="button" disabled={busy !== null} onClick={() => void onAction(hypothesis, 'reactivate')}>Reactivate</button></article>)}</div></details>
}

'use client'

import { useState } from 'react'
import type { MarketHypothesis, MarketHypothesisCrossDomainLink, MarketResearchFrontierItem, MarketThesisWorkspaceData, ThesisPrediction } from '@/lib/markets/types'

type Action = 'freeze' | 'reject' | 'archive' | 'reactivate' | 'request_deepening'

function dateLabel(value: string) {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/New_York' }).format(new Date(value))
}

function actionLabel(hypothesis: MarketHypothesis): { action: Action; label: string } {
  if (hypothesis.status === 'archived' || hypothesis.status === 'rejected') return { action: 'reactivate', label: 'Reactivate' }
  if (hypothesis.status === 'active') return { action: 'freeze', label: 'Freeze automatic revision' }
  return { action: 'request_deepening', label: 'Request deeper research' }
}

export function MarketThesisWorkspace({ initialData }: { initialData: MarketThesisWorkspaceData }) {
  const [data, setData] = useState(initialData)
  const [busy, setBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState('')

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
      setNotice(payload.queued ? 'Deeper research is queued; the current thesis remains unchanged until new evidence is validated.' : 'Market thesis state updated.')
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Unable to update market thesis')
    } finally {
      setBusy(null)
    }
  }

  const forming = data.hypotheses.filter((item) => ['dormant', 'forming', 'proposed'].includes(item.status))
  const history = data.hypotheses.filter((item) => ['rejected', 'archived'].includes(item.status))
  const active = data.theses.filter((item) => item.state === 'active' || item.state === 'weakened')
  const hypothesesById = new Map(data.hypotheses.map((item) => [item.id, item]))

  return <div className="market-thesis-workspace">
    <p className="thesis-intro">These are market models, not capital decisions. They connect demand, supply, constraints, economic capture, and falsifiers; company research must still test whether a security actually captures the economics.</p>
    <section className="market-baseline-card" aria-labelledby="global-baseline-title">
      <header><div><p className="markets-eyebrow">Updating world baseline</p><h2 id="global-baseline-title">Global market context</h2></div>{data.baseline ? <span data-freshness={data.baseline.freshness}>{data.baseline.freshness}</span> : null}</header>
      {data.baseline ? <>
        <p>{data.baseline.content.state}</p>
        <div className="market-baseline-columns">
          <div><span>What changed</span>{data.baseline.content.changes.slice(0, 3).map((item) => <p key={item}>{item}</p>)}</div>
          <div><span>Constraints</span>{data.baseline.content.constraints.slice(0, 3).map((item) => <p key={item}>{item}</p>)}</div>
          <div><span>Open questions</span>{data.baseline.content.openQuestions.slice(0, 3).map((item) => <p key={item}>{item}</p>)}</div>
        </div>
        <footer>v{data.baseline.version} · evidence as of {dateLabel(data.baseline.dataAsOf)} · {data.baseline.diff.length} material change{data.baseline.diff.length === 1 ? '' : 's'} since prior version</footer>
      </> : <p className="thesis-empty">The world-model worker has not published a baseline yet. Ingestion can run safely while automatic promotion remains off.</p>}
    </section>

    <section className="market-thesis-section" aria-labelledby="forming-hypotheses-title">
      <header><div><p className="markets-eyebrow">Signal correlation</p><h2 id="forming-hypotheses-title">Hypotheses forming</h2></div><span>{forming.length} in incubation</span></header>
      {forming.length === 0 ? <p className="thesis-empty">No cluster has enough causal evidence to propose a market thesis yet.</p> : <div className="market-hypothesis-grid">{forming.map((hypothesis) => <HypothesisCard key={hypothesis.id} hypothesis={hypothesis} frontiers={data.frontiers.filter((item) => item.hypothesisId === hypothesis.id)} busy={busy} onAction={takeAction} />)}</div>}
    </section>

    <CrossDomainMap links={data.crossDomainLinks} hypothesesById={hypothesesById} />

    <section className="market-thesis-section" aria-labelledby="active-market-theses-title">
      <header><div><p className="markets-eyebrow">Versioned market models</p><h2 id="active-market-theses-title">Market theses</h2></div><span>{active.length} active or weakened</span></header>
      {active.length === 0 ? <p className="thesis-empty">No thesis has passed the promotion gate. A plausible narrative is deliberately insufficient: the factual core needs fresh official evidence, an independent cross-check, a counter-case, and predictions.</p> : <div className="market-thesis-grid">{active.map((thesis) => <article className="market-thesis-card" key={thesis.id} data-state={thesis.state}>
        <header><div><span>{thesis.state} · v{thesis.version}</span><h3>{thesis.title}</h3></div><strong>{Math.round(thesis.confidence)}%<small> confidence</small></strong></header>
        <p>{thesis.content.whyNow}</p>
        <div className="market-thesis-copy"><div><span>Economic capture</span><p>{thesis.content.economics}</p></div><div><span>What may be priced</span><p>{thesis.content.expectations}</p></div></div>
        <div className="market-thesis-copy"><div><span>Falsifiers</span>{thesis.content.falsifiers.map((item) => <p key={item}>{item}</p>)}</div><div><span>Predictions</span>{thesis.predictions.map((item) => <PredictionLedgerEntry key={item.id} prediction={item} />)}</div></div>
        {thesis.exposures.length > 0 ? <div className="market-exposure-list"><span>Value-chain exposures</span>{thesis.exposures.map((item) => <p key={item.id}>{item.symbol ?? item.entityName} · {item.role} · {item.mechanism} <small>{item.verificationStatus}</small></p>)}</div> : null}
        <footer>{thesis.content.sourceLedger.length} source{thesis.content.sourceLedger.length === 1 ? '' : 's'} · generated {dateLabel(thesis.generatedAt)} {thesis.revisionDiff.length ? `· ${thesis.revisionDiff[0]}` : ''}</footer>
      </article>)}</div>}
    </section>

    {history.length > 0 ? <section className="market-thesis-section market-thesis-history"><header><div><p className="markets-eyebrow">Preserved history</p><h2>Rejected and archived</h2></div><span>{history.length}</span></header><div className="market-hypothesis-grid">{history.map((hypothesis) => <HypothesisCard key={hypothesis.id} hypothesis={hypothesis} frontiers={data.frontiers.filter((item) => item.hypothesisId === hypothesis.id)} busy={busy} onAction={takeAction} />)}</div></section> : null}
    {notice ? <p className="thesis-notice" role="status">{notice}</p> : null}
  </div>
}

function CrossDomainMap({ links, hypothesesById }: { links: MarketHypothesisCrossDomainLink[]; hypothesesById: Map<string, MarketHypothesis> }) {
  if (links.length === 0) return null
  return <section className="market-thesis-section market-cross-domain-section" aria-labelledby="cross-domain-map-title">
    <header><div><p className="markets-eyebrow">Directional transmission</p><h2 id="cross-domain-map-title">Cross-domain mechanism map</h2></div><span>{links.length} retained link{links.length === 1 ? '' : 's'}</span></header>
    <p className="market-cross-domain-intro">A link maps an independently sourced mechanism between two market models. Forming links are research context only; they cannot promote a thesis, establish causality, or create an exposure.</p>
    <div className="market-cross-domain-ledger">
      {links.map((link) => {
        const from = hypothesesById.get(link.fromHypothesisId)
        const to = hypothesesById.get(link.toHypothesisId)
        return <article key={link.id} data-status={link.status}>
          <header><span>{link.status} · {link.relationship}</span><small>{link.sourceObservationIds.length} independently linked observation{link.sourceObservationIds.length === 1 ? '' : 's'} · {Math.round(link.confidence)}% confidence</small></header>
          <div className="market-cross-domain-route"><strong>{from?.title ?? 'Source model'}</strong><i aria-hidden="true">→</i><strong>{to?.title ?? 'Destination model'}</strong></div>
          <p>{link.explanation}</p>
        </article>
      })}
    </div>
  </section>
}

function PredictionLedgerEntry({ prediction }: { prediction: ThesisPrediction }) {
  const evaluation = prediction.latestEvaluation
  return <div className="market-prediction-ledger-entry" data-result={prediction.result}>
    <p>{prediction.prediction}</p>
    <small>{prediction.result}{prediction.deadline ? ` · deadline ${dateLabel(prediction.deadline)}` : ''}</small>
    {evaluation ? <small data-status={evaluation.status}>{evaluation.status === 'complete' ? `${evaluation.verdict} · evaluator v${evaluation.version} · ${evaluation.sourceIds.length} source${evaluation.sourceIds.length === 1 ? '' : 's'}` : evaluation.error || 'Evaluator is processing the bounded evidence ledger.'}</small> : <small>Awaiting a due date or new linked evidence before evaluation.</small>}
  </div>
}

function frontierStatus(item: MarketResearchFrontierItem) {
  if (item.status === 'deferred' && item.adapterId?.startsWith('world-source-scout:')) return 'Candidate discovery awaiting review'
  if (item.status === 'evidence_received') return 'Governed evidence received — analyst revision pending'
  if (item.status === 'blocked') return 'Blocked pending a permitted source path'
  if (item.status === 'complete') return 'Evidence gap resolved'
  return 'Awaiting bounded research routing'
}

function HypothesisCard({ hypothesis, frontiers, busy, onAction }: { hypothesis: MarketHypothesis; frontiers: MarketResearchFrontierItem[]; busy: string | null; onAction: (hypothesis: MarketHypothesis, action: Action) => Promise<void> }) {
  const primary = actionLabel(hypothesis)
  const research = hypothesis.latestResearch
  return <article className="market-hypothesis-card" data-status={hypothesis.status}>
    <header><span>{hypothesis.status} · {Math.round(hypothesis.confidence)}% confidence</span><h3>{hypothesis.title}</h3></header>
    <p>{hypothesis.coreMechanism}</p>
    <div><span>Counter-thesis</span><p>{hypothesis.counterThesis}</p></div>
    {research ? <div className="market-hypothesis-research" data-status={research.status}>
      <span>Analytical research · v{research.version} · {research.status.replace('_', ' ')}</span>
      {research.content ? <>
        <p>{research.content.thesisStatement}</p>
        <small>{research.content.predictions.length} predictions · {research.content.evidenceGaps.length} open evidence gap{research.content.evidenceGaps.length === 1 ? '' : 's'} · {research.sourceIds.length} linked sources</small>
      </> : <p>{research.error || 'The bounded research run is still preparing its source ledger.'}</p>}
      {research.critique?.verdict === 'needs_revision' ? <small>Critic requires revision: {research.critique.summary}</small> : null}
    </div> : <div className="market-hypothesis-research" data-status="pending"><span>Analytical research</span><p>No durable analysis yet; it will queue only when the source gate is met.</p></div>}
    {frontiers.length > 0 ? <div className="market-hypothesis-frontier">
      <span>Research frontier · {frontiers.length} open gap{frontiers.length === 1 ? '' : 's'}</span>
      <p>These questions can trigger governed candidate discovery, but candidates remain outside the evidence ledger until contract, health, and human approval are complete.</p>
      <ul>{frontiers.slice(0, 3).map((item) => <li key={item.id}><strong>{item.question}</strong><small>{frontierStatus(item)} · evidence needed: {item.evidenceNeeded}</small></li>)}</ul>
    </div> : null}
    <footer><span>{hypothesis.evidence.length} linked observation{hypothesis.evidence.length === 1 ? '' : 's'} · {hypothesis.unresolvedNodes.length} unresolved node{hypothesis.unresolvedNodes.length === 1 ? '' : 's'}</span><div><button type="button" disabled={busy !== null} onClick={() => onAction(hypothesis, primary.action)}>{busy === `${hypothesis.id}:${primary.action}` ? 'Saving…' : primary.label}</button>{!['rejected', 'archived'].includes(hypothesis.status) ? <button type="button" disabled={busy !== null} onClick={() => onAction(hypothesis, 'archive')}>Archive</button> : null}</div></footer>
  </article>
}

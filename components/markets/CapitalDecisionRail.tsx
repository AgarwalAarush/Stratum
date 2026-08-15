'use client'

import { FormEvent, useState } from 'react'
import { formatEntryAction } from '@/lib/markets/research-presentation'
import type { CapitalConstraintAssessment, CandidateBrief, EquityResearchNote, PortfolioDecisionOption, ThesisDecision } from '@/lib/markets/types'
import { MarketSelect } from './MarketSelect'
import { MarketsIntentLink } from './MarketsIntentLink'
import { ResearchActionButton } from './ResearchActionButton'

type DecisionResearch = Pick<EquityResearchNote, 'formalRating' | 'entryAction' | 'fastestKillSignal' | 'version'>
  & Partial<Pick<EquityResearchNote, 'fairValue' | 'entryZoneLow' | 'entryZoneHigh'>>

export function CapitalDecisionRail({
  symbol,
  initial,
  research,
  candidate,
  thesis,
  portfolios,
  constraint,
  instrumentType = 'equity',
}: {
  symbol: string
  initial: ThesisDecision | null
  research: DecisionResearch | null
  candidate: CandidateBrief | null
  thesis: { id: string; researchNoteId: string | null } | null
  portfolios: PortfolioDecisionOption[]
  constraint: CapitalConstraintAssessment | null
  instrumentType?: 'equity' | 'etf'
}) {
  const [editing, setEditing] = useState(false)
  const [notice, setNotice] = useState('')
  const [decision, setDecision] = useState<ThesisDecision | null>(initial)
  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const response = await fetch('/api/markets/portfolio', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'save-decision',
        symbol,
        investmentThesisId: thesis?.id,
        portfolioId: form.get('portfolioId'),
        disposition: form.get('disposition'),
        formalRating: form.get('formalRating'),
        entryAction: form.get('entryAction'),
        fairValue: form.get('fairValue'),
        entryZoneLow: form.get('entryZoneLow'),
        entryZoneHigh: form.get('entryZoneHigh'),
        conviction: form.get('conviction'),
        nextCatalyst: form.get('nextCatalyst'),
        rationale: form.get('rationale'),
        valuationSupport: form.get('valuationSupport'),
        whatChanged: form.get('whatChanged'),
        targetWeightPct: form.get('targetWeightPct'),
        maxPositionWeightPct: form.get('maxPositionWeightPct'),
        maxCorrelatedWeightPct: form.get('maxCorrelatedWeightPct'),
        maxLiquidityDays: form.get('maxLiquidityDays'),
        correlationGroup: form.get('correlationGroup'),
        killCriteria: form.get('killCriteria') && form.get('killValue')
          ? [{
            id: `manual-${Date.now()}`,
            description: form.get('killCriteria'),
            metric: 'price',
            operator: form.get('killOperator'),
            value: Number(form.get('killValue')),
          }]
          : [],
      }),
    })
    const payload = await response.json()
    if (!response.ok) {
      setNotice(payload.error ?? 'Decision could not be saved')
      return
    }
    setDecision(payload.decision)
    setEditing(false)
    setNotice('Decision version saved.')
  }
  const addToWatchlist = async () => {
    const response = await fetch('/api/markets/portfolio', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'add-watchlist-symbol', symbol }),
    })
    setNotice(response.ok ? `${symbol} added to the primary watchlist.` : 'The watchlist could not be updated.')
  }

  if (editing) {
    return (
      <aside className="stock-decision-rail">
        <p className="markets-eyebrow">Decision editor</p>
        <h2>Capital allocation</h2>
        <form className="capital-decision-form" onSubmit={save}>
          <div className="market-form-field"><span>Account</span><MarketSelect name="portfolioId" defaultValue={decision?.portfolioId ?? portfolios[0]?.id ?? ''} ariaLabel="Portfolio account" options={portfolios.map((portfolio) => ({ value: portfolio.id, label: `${portfolio.name} · ${portfolio.kind}` }))} /></div>
          <div className="market-form-field"><span>Disposition</span><MarketSelect name="disposition" defaultValue={decision?.disposition ?? 'watch'} ariaLabel="Disposition" options={[{ value: 'own', label: 'Own' }, { value: 'watch', label: 'Watch' }, { value: 'avoid', label: 'Avoid' }]} /></div>
          <div className="market-form-field"><span>Formal rating</span><MarketSelect name="formalRating" defaultValue={decision?.formalRating ?? research?.formalRating ?? 'NOT_RATED'} ariaLabel="Formal rating" options={['BUY', 'HOLD', 'SELL', 'NOT_RATED'].map((value) => ({ value, label: value }))} /></div>
          <div className="market-form-field"><span>Entry action</span><MarketSelect name="entryAction" defaultValue={decision?.entryAction ?? research?.entryAction ?? 'wait'} ariaLabel="Entry action" options={[{ value: 'buy_now', label: 'Buy now' }, { value: 'nibble', label: 'Start with a small position' }, { value: 'wait', label: 'Wait for a better setup' }, { value: 'add_on_weakness', label: 'Add on weakness' }, { value: 'avoid', label: 'Avoid' }]} /></div>
          <label>Fair value<input name="fairValue" type="number" step="0.01" defaultValue={decision?.fairValue ?? research?.fairValue ?? ''} /></label>
          <div><label>Entry low<input name="entryZoneLow" type="number" step="0.01" defaultValue={decision?.entryZoneLow ?? research?.entryZoneLow ?? ''} /></label><label>Entry high<input name="entryZoneHigh" type="number" step="0.01" defaultValue={decision?.entryZoneHigh ?? research?.entryZoneHigh ?? ''} /></label></div>
          <div className="market-form-field"><span>Conviction</span><MarketSelect name="conviction" defaultValue={decision?.conviction?.toString() ?? ''} ariaLabel="Conviction" options={[{ value: '', label: '—' }, ...[1, 2, 3, 4, 5].map((value) => ({ value: String(value), label: String(value) }))]} /></div>
          <label>Next catalyst<input name="nextCatalyst" defaultValue={decision?.nextCatalyst ?? candidate?.catalyst ?? ''} /></label>
          <label>Valuation support<textarea name="valuationSupport" required defaultValue={decision?.valuationSupport ?? ''} placeholder="Why the fair value and entry range are supported" /></label>
          <label>What changed<textarea name="whatChanged" required defaultValue={decision?.whatChanged ?? candidate?.whatChanged.join('\n') ?? ''} placeholder="New evidence or a deliberate unchanged review" /></label>
          <fieldset className="capital-sizing-inputs">
            <legend>Owner-supplied sizing limits</legend>
            <p>Stratum checks these inputs. It does not recommend a position size or place an order.</p>
            <label>Target weight (%)<input name="targetWeightPct" type="number" min="0.01" max="100" step="0.01" defaultValue={decision?.sizingInputs?.targetWeightPct ?? ''} /></label>
            <label>Position ceiling (%)<input name="maxPositionWeightPct" type="number" min="0.01" max="100" step="0.01" defaultValue={decision?.sizingInputs?.maxPositionWeightPct ?? ''} /></label>
            <label>Correlated ceiling (%)<input name="maxCorrelatedWeightPct" type="number" min="0.01" max="100" step="0.01" defaultValue={decision?.sizingInputs?.maxCorrelatedWeightPct ?? ''} /></label>
            <label>Liquidity limit (days)<input name="maxLiquidityDays" type="number" min="0.01" step="0.01" defaultValue={decision?.sizingInputs?.maxLiquidityDays ?? ''} /></label>
            <label>Correlation group<input name="correlationGroup" defaultValue={decision?.sizingInputs?.correlationGroup ?? ''} placeholder="e.g. Semiconductors" /></label>
          </fieldset>
          <label>Kill criteria<textarea name="killCriteria" defaultValue={decision?.killCriteria[0]?.description ?? research?.fastestKillSignal ?? ''} /></label>
          <div>
            <div className="market-form-field"><span>Trigger</span><MarketSelect name="killOperator" defaultValue={decision?.killCriteria[0]?.operator ?? 'lt'} ariaLabel="Kill criteria trigger" options={[{ value: 'lt', label: 'Price below' }, { value: 'gt', label: 'Price above' }]} /></div>
            <label>Threshold<input name="killValue" type="number" step="0.01" defaultValue={decision?.killCriteria[0]?.value ?? ''} /></label>
          </div>
          <label>Rationale<textarea name="rationale" defaultValue={decision?.rationale ?? ''} /></label>
          <button type="submit">Save decision version</button>
          <button type="button" onClick={() => setEditing(false)}>Cancel</button>
        </form>
      </aside>
    )
  }

  return (
    <aside className="stock-decision-rail">
      <p className="markets-eyebrow">Decision, not execution</p>
      <h2>Capital allocation</h2>
      <dl>
        <div><dt>Disposition</dt><dd>{decision?.disposition ?? 'Unclassified'}</dd></div>
        <div><dt>Formal rating</dt><dd>{decision?.formalRating ?? research?.formalRating ?? 'Not researched'}</dd></div>
        <div><dt>Entry action</dt><dd>{formatEntryAction(decision?.entryAction ?? research?.entryAction ?? 'wait')}</dd></div>
        <div><dt>Fair value</dt><dd>{decision?.fairValue ?? research?.fairValue ?? '—'}</dd></div>
        <div><dt>Entry zone</dt><dd>{decision?.entryZoneLow ?? research?.entryZoneLow ?? '—'} – {decision?.entryZoneHigh ?? research?.entryZoneHigh ?? '—'}</dd></div>
        <div><dt>Conviction</dt><dd>{decision?.conviction ? `${decision.conviction}/5` : '—'}</dd></div>
        <div><dt>Next catalyst</dt><dd>{decision?.nextCatalyst ?? candidate?.catalyst ?? '—'}</dd></div>
        <div><dt>Kill criteria</dt><dd>{decision?.killCriteria[0]?.description ?? research?.fastestKillSignal ?? candidate?.redFlags[0] ?? 'Define after research'}</dd></div>
        <div><dt>Account</dt><dd>{portfolios.find((portfolio) => portfolio.id === decision?.portfolioId)?.name ?? 'Not assigned'}</dd></div>
        <div><dt>Constraint review</dt><dd>{decision?.constraintStatus?.replaceAll('_', ' ') ?? 'Not evaluated'}</dd></div>
      </dl>
      {decision?.changeSummary.length ? <div className="capital-change-summary"><span>What changed</span><ul>{decision.changeSummary.map((item) => <li key={item}>{item}</li>)}</ul></div> : null}
      {constraint ? <div className="capital-constraint-ledger" data-status={constraint.status}>
        <span>Constraint ledger · {constraint.status.replaceAll('_', ' ')}</span>
        {constraint.checks.map((check) => <p key={check.id}><strong>{check.label}</strong> · {check.summary}</p>)}
      </div> : null}
      {thesis ? <>
        <small>Linked to accepted thesis{thesis.researchNoteId ? ` and research evidence` : ''}.</small>
        <button type="button" onClick={() => setEditing(true)}>Edit decision</button>
      </> : <>
        <p className="capital-decision-prerequisite">Accept a company thesis before recording a capital decision. Research and a thesis stay separate from the action taken with capital.</p>
        <MarketsIntentLink href="/markets/theses">Review company theses →</MarketsIntentLink>
      </>}
      <button type="button" className="capital-watchlist-button" onClick={addToWatchlist}>Add to watchlist</button>
      <ResearchActionButton symbol={symbol} hasResearch={Boolean(research)} currentVersion={research?.version} instrumentType={instrumentType} />
      {notice ? <small>{notice}</small> : null}
    </aside>
  )
}

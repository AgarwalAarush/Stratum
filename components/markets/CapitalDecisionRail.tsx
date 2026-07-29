'use client'

import { FormEvent, useState } from 'react'
import type { CandidateBrief, EquityResearchNote, ThesisDecision } from '@/lib/markets/types'
import { ResearchActionButton } from './ResearchActionButton'

export function CapitalDecisionRail({
  symbol,
  initial,
  research,
  candidate,
}: {
  symbol: string
  initial: ThesisDecision | null
  research: EquityResearchNote | null
  candidate: CandidateBrief | null
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
        disposition: form.get('disposition'),
        formalRating: form.get('formalRating'),
        entryAction: form.get('entryAction'),
        fairValue: form.get('fairValue'),
        entryZoneLow: form.get('entryZoneLow'),
        entryZoneHigh: form.get('entryZoneHigh'),
        conviction: form.get('conviction'),
        nextCatalyst: form.get('nextCatalyst'),
        rationale: form.get('rationale'),
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
          <label>Disposition<select name="disposition" defaultValue={decision?.disposition ?? 'watch'}><option value="own">Own</option><option value="watch">Watch</option><option value="avoid">Avoid</option></select></label>
          <label>Formal rating<select name="formalRating" defaultValue={decision?.formalRating ?? research?.formalRating ?? 'NOT_RATED'}><option>BUY</option><option>HOLD</option><option>SELL</option><option>NOT_RATED</option></select></label>
          <label>Entry action<select name="entryAction" defaultValue={decision?.entryAction ?? research?.entryAction ?? 'wait'}><option value="buy_now">Buy now</option><option value="nibble">Nibble</option><option value="wait">Wait</option><option value="add_on_weakness">Add on weakness</option><option value="avoid">Avoid</option></select></label>
          <label>Fair value<input name="fairValue" type="number" step="0.01" defaultValue={decision?.fairValue ?? research?.fairValue ?? ''} /></label>
          <div><label>Entry low<input name="entryZoneLow" type="number" step="0.01" defaultValue={decision?.entryZoneLow ?? research?.entryZoneLow ?? ''} /></label><label>Entry high<input name="entryZoneHigh" type="number" step="0.01" defaultValue={decision?.entryZoneHigh ?? research?.entryZoneHigh ?? ''} /></label></div>
          <label>Conviction<select name="conviction" defaultValue={decision?.conviction ?? ''}><option value="">—</option>{[1, 2, 3, 4, 5].map((value) => <option key={value}>{value}</option>)}</select></label>
          <label>Next catalyst<input name="nextCatalyst" defaultValue={decision?.nextCatalyst ?? candidate?.catalyst ?? ''} /></label>
          <label>Kill criteria<textarea name="killCriteria" defaultValue={decision?.killCriteria[0]?.description ?? research?.fastestKillSignal ?? ''} /></label>
          <div>
            <label>Trigger<select name="killOperator" defaultValue={decision?.killCriteria[0]?.operator ?? 'lt'}><option value="lt">Price below</option><option value="gt">Price above</option></select></label>
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
        <div><dt>Entry action</dt><dd>{(decision?.entryAction ?? research?.entryAction ?? 'wait').replaceAll('_', ' ')}</dd></div>
        <div><dt>Fair value</dt><dd>{decision?.fairValue ?? research?.fairValue ?? '—'}</dd></div>
        <div><dt>Entry zone</dt><dd>{decision?.entryZoneLow ?? research?.entryZoneLow ?? '—'} – {decision?.entryZoneHigh ?? research?.entryZoneHigh ?? '—'}</dd></div>
        <div><dt>Conviction</dt><dd>{decision?.conviction ? `${decision.conviction}/5` : '—'}</dd></div>
        <div><dt>Next catalyst</dt><dd>{decision?.nextCatalyst ?? candidate?.catalyst ?? '—'}</dd></div>
        <div><dt>Kill criteria</dt><dd>{decision?.killCriteria[0]?.description ?? research?.fastestKillSignal ?? candidate?.redFlags[0] ?? 'Define after research'}</dd></div>
      </dl>
      <button type="button" onClick={() => setEditing(true)}>Edit decision</button>
      <button type="button" className="capital-watchlist-button" onClick={addToWatchlist}>Add to watchlist</button>
      <ResearchActionButton symbol={symbol} hasResearch={Boolean(research)} />
      {notice ? <small>{notice}</small> : null}
    </aside>
  )
}

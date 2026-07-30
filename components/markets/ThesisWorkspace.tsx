'use client'

import { useState } from 'react'
import type { InvestmentThesis, ThesisWorkspaceData } from '@/lib/markets/types'
import { MarketsIntentLink } from './MarketsIntentLink'

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

export function ThesisWorkspace({ initialData }: { initialData: ThesisWorkspaceData }) {
  const [proposals, setProposals] = useState(initialData.proposals)
  const [accepted, setAccepted] = useState(initialData.accepted)
  const [busy, setBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState('')

  const review = async (thesis: InvestmentThesis, decision: 'accept' | 'reject') => {
    setBusy(thesis.id)
    setNotice('')
    try {
      const response = await fetch('/api/markets/theses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ thesisId: thesis.id, decision }),
      })
      const payload = await response.json() as { error?: string }
      if (!response.ok) throw new Error(payload.error ?? 'Unable to review thesis')
      setProposals((current) => current.filter((item) => item.id !== thesis.id))
      if (decision === 'accept') {
        setAccepted((current) => [
          { ...thesis, status: 'accepted', reviewedAt: new Date().toISOString() },
          ...current.filter((item) => item.entityKey !== thesis.entityKey),
        ])
      }
      setNotice(decision === 'accept' ? `${title(thesis)} thesis accepted.` : `${title(thesis)} proposal rejected.`)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Unable to review thesis')
    } finally {
      setBusy(null)
    }
  }

  return (
    <section className="thesis-workspace">
      <header className="market-explore-heading">
        <div>
          <p className="markets-eyebrow">Evidence-backed and versioned</p>
          <h1 className="markets-display">Theses</h1>
        </div>
        <span>{proposals.length} awaiting review</span>
      </header>
      <p className="thesis-intro">A screen can surface a name; a thesis states the belief, what changed, and what would prove it wrong. New evidence creates a proposal—never a silent rewrite.</p>

      <section className="thesis-review-queue" aria-labelledby="thesis-review-title">
        <header>
          <div><p className="markets-eyebrow">Review queue</p><h2 id="thesis-review-title">Proposed updates</h2></div>
          <span>{proposals.length} open</span>
        </header>
        {proposals.length === 0 ? <p className="thesis-empty">No updates need review. A completed research run, a material event, or a new industry leadership signal will create the next proposal.</p> : (
          <div className="thesis-proposal-list">
            {proposals.map((thesis) => (
              <article key={thesis.id} className="thesis-proposal">
                <header>
                  <div><span>{thesis.entityType === 'stock' ? 'Stock thesis' : 'Industry thesis'}</span><h3>{title(thesis)}</h3><small>{label(thesis)} · proposed v{thesis.version}</small></div>
                  <time dateTime={thesis.generatedAt}>{new Date(thesis.generatedAt).toLocaleDateString()}</time>
                </header>
                <div className="thesis-proposal-copy"><strong>{thesis.content.headline}</strong><p>{thesis.content.summary}</p></div>
                <dl>
                  <div><dt>What changed</dt><dd>{thesis.content.whatChanged}</dd></div>
                  <div><dt>Next question</dt><dd>{thesis.content.nextQuestion}</dd></div>
                </dl>
                <footer>
                  <span>{thesis.sources.length} linked source{thesis.sources.length === 1 ? '' : 's'} · {thesis.trigger.replaceAll('-', ' ')}</span>
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
            {accepted.map((thesis) => (
              <article key={thesis.id} className="thesis-library-item">
                <header><div><span>{thesis.entityType === 'stock' ? 'Stock' : 'Industry'}</span><h3>{title(thesis)}</h3></div><small>v{thesis.version}</small></header>
                <p>{thesis.content.summary}</p>
                <div className="thesis-list-columns">
                  <div><span>Catalysts</span>{list(thesis.content.catalysts).map((item) => <p key={item}>{item}</p>)}</div>
                  <div><span>Invalidation</span>{list(thesis.content.invalidation).map((item) => <p key={item}>{item}</p>)}</div>
                </div>
                {thesis.symbol ? <MarketsIntentLink href={`/markets/stocks/${thesis.symbol}`}>Open {thesis.symbol} dossier →</MarketsIntentLink> : <small>{label(thesis)}</small>}
              </article>
            ))}
          </div>
        )}
      </section>
      {notice ? <p className="thesis-notice" role="status">{notice}</p> : null}
    </section>
  )
}

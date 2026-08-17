'use client'

import { ArrowRight } from '@phosphor-icons/react'
import { useEffect, useState } from 'react'
import { MarketsIntentLink } from './MarketsIntentLink'
import type { MarketThesisBrief as MarketThesisBriefData } from '@/lib/markets/thesis-brief'

function dateLabel(value: string | null): string {
  if (!value) return 'Date not set'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Date not set'
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'America/New_York',
  }).format(date)
}

/**
 * The thesis library is owner-specific and involves several durable evidence
 * reads. It enriches the Overview after the market snapshot has painted.
 */
export function MarketThesisBrief() {
  const [brief, setBrief] = useState<MarketThesisBriefData | null | undefined>(undefined)

  useEffect(() => {
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      void fetch('/api/markets/thesis-brief', { signal: controller.signal })
        .then(async (response) => response.ok ? await response.json() as { brief: MarketThesisBriefData | null } : null)
        .then((response) => {
          if (!controller.signal.aborted) setBrief(response?.brief ?? null)
        })
        .catch(() => {
          if (!controller.signal.aborted) setBrief(null)
        })
    }, 400)
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [])

  if (brief === null) return null

  return (
    <section className="market-thesis-brief" aria-labelledby="market-thesis-brief-title" aria-busy={brief === undefined}>
      <header className="market-section-heading">
        <div>
          <p className="markets-eyebrow">Thesis book</p>
          <h2 id="market-thesis-brief-title">What the system is testing</h2>
          <p>{brief === undefined ? 'Loading active models and their next tests.' : `${brief.modelCount} active models · ${brief.predictionCount} open predictions · ${brief.observationCount} material observations${brief.crossDomainLinkCount > 0 ? ` · ${brief.crossDomainLinkCount} linked mechanisms` : ''}`}</p>
        </div>
        <MarketsIntentLink href="/markets/theses">Open thesis library <ArrowRight size={15} aria-hidden="true" /></MarketsIntentLink>
      </header>
      {brief === undefined ? <div className="market-thesis-brief-loading"><span /><span /></div> : (
        <div className="market-thesis-brief-grid">
          <div className="market-thesis-brief-models">
            {brief.models.map((model) => <article key={model.id}>
              <div><span>Active model</span><small>{Math.round(model.confidence)}% confidence · {model.evidenceCount} source{model.evidenceCount === 1 ? '' : 's'}</small></div>
              <h3>{model.title}</h3>
              <p>{model.whyNow}</p>
              <footer>{model.predictionCount} open test{model.predictionCount === 1 ? '' : 's'} · {model.exposureCount} mapped exposure{model.exposureCount === 1 ? '' : 's'}</footer>
            </article>)}
          </div>
          <aside className="market-thesis-brief-tests" aria-label="Next thesis tests">
            <p className="markets-eyebrow">Next tests</p>
            {brief.predictions.length > 0 ? brief.predictions.map((prediction) => <article key={prediction.id}>
              <span>{dateLabel(prediction.deadline)}</span>
              <strong>{prediction.modelTitle}</strong>
              <p>{prediction.prediction}</p>
            </article>) : <p className="market-thesis-brief-empty">No pending model test has a dated evaluation window.</p>}
          </aside>
        </div>
      )}
    </section>
  )
}

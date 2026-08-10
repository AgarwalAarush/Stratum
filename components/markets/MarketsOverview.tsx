'use client'

import { ArrowSquareOut } from '@phosphor-icons/react'
import { MarketsIntentLink } from './MarketsIntentLink'
import { buildMarketDailyBrief } from '@/lib/markets/brief'
import type { MarketOverviewResponse } from '@/lib/markets/types'

interface MarketsOverviewProps {
  overview: MarketOverviewResponse
}

const CANDIDATE_LANE_LABEL = {
  market_thesis: 'Market-thesis exposure',
  thesis_led: 'Tracked-thesis selloff',
  dislocation: 'Possible overreaction',
  fundamental_inflection: 'Fundamental inflection',
  leadership: 'New leadership',
} as const

function candidateMove(value: number | null | undefined, period: string): string | null {
  return typeof value === 'number' && Number.isFinite(value)
    ? `${period} ${value >= 0 ? '+' : ''}${value.toFixed(1)}%`
    : null
}

function feedLabel(feed: MarketOverviewResponse['feed']): string {
  if (feed === 'illustrative') return 'Illustrative'
  if (feed === 'delayed_sip') return 'Delayed SIP'
  return feed.toUpperCase()
}

function formatMarketTime(value: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(new Date(value))
}

function formatEvidenceTime(value: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(new Date(value))
}

function tradingSessionLabel(value: string | undefined): string {
  if (!value) return 'Latest session'
  const date = new Date(`${value}T12:00:00.000Z`)
  if (Number.isNaN(date.getTime())) return 'Latest session'
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'long',
  }).format(date)
}

function formatInstrumentTime(value: string, dataStatus: MarketOverviewResponse['instruments'][number]['dataStatus']): string {
  const options: Intl.DateTimeFormatOptions = dataStatus === 'end_of_day'
    ? { timeZone: 'America/New_York', month: 'short', day: 'numeric' }
    : { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }
  return new Intl.DateTimeFormat('en-US', options).format(new Date(value))
}

function dataStatusLabel(value: MarketOverviewResponse['instruments'][number]['dataStatus']): string {
  if (value === 'real_time') return 'Live'
  if (value === 'end_of_day') return 'EOD'
  return 'Delayed'
}

export function MarketsOverview({ overview }: MarketsOverviewProps) {
  const sessionLabel = tradingSessionLabel(overview.leadership?.tradingDate)
  const brief = buildMarketDailyBrief(overview)

  return (
    <article className="market-overview">
      <section className="market-overview-hero" aria-labelledby="market-state-title">
        <p className="markets-eyebrow">Markets</p>
        <h1 id="market-state-title" className="markets-display market-overview-title">
          Daily market brief
        </h1>
        <p className="market-overview-deck">{brief.summary}</p>
        <div className="market-overview-meta">
          <span>{overview.state.regime}</span>
          <span>{feedLabel(overview.feed)} · {formatMarketTime(overview.dataAsOf)}{overview.stale ? ' · Stale' : ''}</span>
        </div>
      </section>

      <section className="market-instrument-tape" aria-label="Market instruments">
        {overview.instruments.map((instrument) => (
          <a
            key={instrument.id}
            className="market-instrument"
            href={instrument.sourceUrl}
            target="_blank"
            rel="noreferrer"
            title={`${instrument.instrumentType.replaceAll('_', ' ')} · Retrieved ${formatMarketTime(instrument.retrievedAt)}`}
          >
            <span className="market-instrument-primary">
              <span className="market-instrument-label">{instrument.label}</span>
              <span>{instrument.value}</span>
              <span className={instrument.direction === 'up' ? 'market-positive' : instrument.direction === 'down' ? 'market-negative' : ''}>
                {instrument.change}
              </span>
            </span>
            <span className="market-instrument-provenance">
              {instrument.source.toUpperCase()} · {dataStatusLabel(instrument.dataStatus)} · {formatInstrumentTime(instrument.feedTimestamp, instrument.dataStatus)}
            </span>
          </a>
        ))}
      </section>

      <section className="market-daily-brief" aria-labelledby="market-daily-brief-title">
        <header>
          <div><p className="markets-eyebrow">The read</p><h2 id="market-daily-brief-title">What matters today</h2></div>
          <span>{formatMarketTime(overview.dataAsOf)}</span>
        </header>
        <div className="market-daily-brief-lines">
          {brief.lines.map((line) => line.href ? (
            <MarketsIntentLink key={line.label} href={line.href}><span>{line.label}</span><p>{line.text}</p></MarketsIntentLink>
          ) : <div key={line.label}><span>{line.label}</span><p>{line.text}</p></div>)}
        </div>
        {overview.evidence.length > 0 ? <details className="market-daily-brief-sources">
          <summary>{overview.evidence.length} {overview.evidence.length === 1 ? 'source' : 'sources'} behind this brief</summary>
          <div>{overview.evidence.map((evidence) => <a key={evidence.id} href={evidence.url} target="_blank" rel="noreferrer"><span>{evidence.source}</span><span title={evidence.publishedAt}>{formatEvidenceTime(evidence.publishedAt)}</span><ArrowSquareOut size={14} aria-hidden="true" /></a>)}</div>
        </details> : null}
      </section>

      {overview.leadership ? (
        <section className="market-structure-panel" aria-labelledby="market-structure-title">
          <div className="market-section-heading">
            <div>
              <p className="markets-eyebrow">Hermes market structure</p>
              <h2 id="market-structure-title">{sessionLabel}&apos;s Market Structure</h2>
            </div>
            <MarketsIntentLink href="/markets/explore?view=sub-industries">Explore all groups →</MarketsIntentLink>
          </div>
          <div className="market-structure-columns">
            <div>
              <h3>Leading sub-industries <span>{sessionLabel}</span></h3>
              {overview.leadership.subIndustries.slice(0, 5).map((group) => (
                <MarketsIntentLink key={`${group.sector}-${group.label}`} href={`/markets/explore?view=sub-industries&group=${encodeURIComponent(group.label)}`}>
                  <span>{group.label}</span>
                  <span className={(group.dayReturn ?? 0) >= 0 ? 'market-positive' : 'market-negative'}>
                    {group.dayReturn === null ? '—' : `${group.dayReturn >= 0 ? '+' : ''}${group.dayReturn.toFixed(1)}%`}
                  </span>
                </MarketsIntentLink>
              ))}
            </div>
            <div>
              <h3>What is diverging</h3>
              {overview.leadership.divergences.slice(0, 5).map((signal) => (
                <p key={signal.id}>{signal.summary}</p>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {overview.candidates && overview.candidates.length > 0 ? (
        <section className="market-priority-grid" aria-label="Market attention and candidates">
          <section className="market-candidate-panel" aria-labelledby="candidate-scout-title">
              <div className="market-section-heading">
                <div>
                  <p className="markets-eyebrow">Candidate Scout</p>
                  <h2 id="candidate-scout-title">Candidates to investigate</h2>
                </div>
                <span>{overview.candidates.length} post-close briefs</span>
              </div>
              <div className="market-candidate-grid">
                {overview.candidates.map((candidate) => (
                  <MarketsIntentLink key={candidate.id} href={`/markets/stocks/${candidate.symbol}`} className="market-candidate-card">
                    <div className="market-candidate-card-kicker">
                      <span>{CANDIDATE_LANE_LABEL[candidate.primaryLane ?? 'leadership']}</span>
                      <span>{[
                        candidateMove(candidate.selloff?.day, '1D'),
                        candidateMove(candidate.selloff?.fiveDay, '1W'),
                        candidateMove(candidate.selloff?.thirtyDay, '1M'),
                      ].filter(Boolean).join(' · ')}</span>
                    </div>
                    <div>
                      <strong>{candidate.symbol}</strong>
                      <span>{candidate.company}</span>
                    </div>
                    <p>{candidate.whySurfaced}</p>
                    <span>{candidate.subIndustry} · Open dossier →</span>
                  </MarketsIntentLink>
                ))}
              </div>
              {overview.candidateWeeklySummary ? (
                <aside className="market-candidate-weekly-summary" aria-label="Candidate Scout weekly summary">
                  <div>
                    <p className="markets-eyebrow">This week</p>
                    <strong>{overview.candidateWeeklySummary.candidateCount} briefs · {overview.candidateWeeklySummary.uniqueSymbolCount} names</strong>
                    <span>Week ended {new Date(`${overview.candidateWeeklySummary.weekEnding}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                  </div>
                  <div>
                    <p>Decision flow</p>
                    <strong>{overview.candidateWeeklySummary.statusCounts.promoted} promoted · {overview.candidateWeeklySummary.statusCounts.watchlisted} watched</strong>
                  </div>
                  <div>
                    <p>Recurring groups</p>
                    <strong>{overview.candidateWeeklySummary.leadingSubIndustries.length === 0
                      ? 'No recurring groups'
                      : overview.candidateWeeklySummary.leadingSubIndustries.map((group) => `${group.label} (${group.candidateCount})`).join(' · ')}</strong>
                  </div>
                </aside>
              ) : null}
          </section>
        </section>
      ) : null}

      {overview.leadership ? (
        <section className="market-analysis-grid" aria-label="Market analysis">
          <div className="market-leadership-map">
            <div className="market-analysis-heading"><p className="markets-eyebrow">Leadership map</p><h2>Where the move is concentrated</h2></div>
            <div className="market-group-readings">
              {overview.leadership.sectors.slice(0, 5).map((group) => (
                <MarketsIntentLink key={group.label} href={`/markets/explore?view=sectors&group=${encodeURIComponent(group.label)}`}>
                  <span>{group.label}</span>
                  <span>{group.constituentCount} names</span>
                  <strong className={(group.dayReturn ?? 0) >= 0 ? 'market-positive' : 'market-negative'}>{group.dayReturn === null ? '—' : `${group.dayReturn >= 0 ? '+' : ''}${group.dayReturn.toFixed(1)}%`}</strong>
                </MarketsIntentLink>
              ))}
            </div>
            <MarketsIntentLink href="/markets/explore?view=sectors" className="market-analysis-link">Explore sector depth →</MarketsIntentLink>
          </div>
          <div className="market-counter-signals">
            <div className="market-analysis-heading"><p className="markets-eyebrow">Counter-signals</p><h2>What is not confirming</h2></div>
            {overview.leadership.divergences.length > 0 ? overview.leadership.divergences.slice(0, 3).map((signal) => (
              <MarketsIntentLink key={signal.id} href={`/markets/explore?view=sub-industries&group=${encodeURIComponent(signal.groupLabel)}`}>
                <strong>{signal.groupLabel}</strong><span>{signal.summary}</span>
              </MarketsIntentLink>
            )) : <p className="market-analysis-empty">No material short-term versus long-term divergence is available in this snapshot.</p>}
          </div>
        </section>
      ) : null}

      <footer className="market-overview-footer">
        <span>{feedLabel(overview.feed)} data · Data as of {formatMarketTime(overview.dataAsOf)}</span>
        <span>US equities · {overview.feed} feed{overview.stale ? ' · stale' : ''}</span>
      </footer>
    </article>
  )
}

'use client'

import { ArrowDown, ArrowSquareOut, ArrowUp } from '@phosphor-icons/react'
import { useState } from 'react'
import { MarketsIntentLink } from './MarketsIntentLink'
import type { MarketOverviewResponse } from '@/lib/markets/types'

interface MarketsOverviewProps {
  overview: MarketOverviewResponse
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
  const [selectedEvidenceId, setSelectedEvidenceId] = useState(overview.evidence[0]?.id ?? '')

  return (
    <article className="market-overview">
      <section className="market-overview-hero" aria-labelledby="market-state-title">
        <p className="markets-eyebrow">Market state</p>
        <h1 id="market-state-title" className="markets-display market-overview-title">
          {overview.state.regime}
        </h1>
        <div className="market-overview-meta">
          <span>{overview.state.confidence}% confidence</span>
          <span>{feedLabel(overview.feed)}{overview.stale ? ' · Stale' : ''}</span>
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

      <section className="market-overview-evidence-grid">
        <div className="market-change-panel">
          <h2>What changed</h2>
          <ol className="market-change-list">
            {overview.memo.changes.map((change) => (
              <li key={change.id}>
                <p>{change.body}</p>
                <span>Source: {change.source} · {change.sourceTime}</span>
              </li>
            ))}
          </ol>
        </div>

        <div className="market-evidence-panel">
          <h2>Evidence</h2>
          <div className="market-evidence-list" aria-label="Evidence sources">
            {overview.evidence.map((evidence) => {
              const selected = evidence.id === selectedEvidenceId
              return (
                <a
                  key={evidence.id}
                  href={evidence.url}
                  target="_blank"
                  rel="noreferrer"
                  aria-current={selected ? 'true' : undefined}
                  className={`market-evidence-row ${selected ? 'market-evidence-row-selected' : ''}`}
                  onClick={() => setSelectedEvidenceId(evidence.id)}
                >
                  <span>{evidence.source}</span>
                  <span title={evidence.publishedAt}>{formatEvidenceTime(evidence.publishedAt)}</span>
                  <ArrowSquareOut size={17} aria-hidden="true" />
                </a>
              )
            })}
          </div>
          <p className="market-evidence-count">1 of {overview.evidence.length} selected</p>
        </div>
      </section>

      {overview.leadership ? (
        <section className="market-structure-panel" aria-labelledby="market-structure-title">
          <div className="market-section-heading">
            <div>
              <p className="markets-eyebrow">Hermes market structure</p>
              <h2 id="market-structure-title">Today&apos;s Market Structure</h2>
            </div>
            <MarketsIntentLink href="/markets/explore?view=sub-industries">Explore all groups →</MarketsIntentLink>
          </div>
          <div className="market-breadth-strip">
            <div><strong>{overview.leadership.advancingPercent.toFixed(0)}%</strong><span>advancing</span></div>
            <div><strong>{overview.leadership.above50DayPercent.toFixed(0)}%</strong><span>above 50-day</span></div>
            <div><strong>{overview.leadership.usableCount}/{overview.leadership.universeCount}</strong><span>usable series</span></div>
          </div>
          <div className="market-structure-columns">
            <div>
              <h3>Leading sub-industries <span>Today</span></h3>
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
      ) : null}

      <section className="market-implication-grid">
        <div>
          <h2>Sector implications</h2>
          <ul className="market-sector-list">
            {overview.memo.sectorImplications.map((item) => (
              <li key={item.text}>
                {item.direction === 'up' ? <ArrowUp size={14} className="market-positive" /> : <ArrowDown size={14} className="market-negative" />}
                <span>{item.text}</span>
              </li>
            ))}
          </ul>
          <MarketsIntentLink href="/markets/explore?view=stocks" className="market-open-screener">
            Explore Stocks <span aria-hidden="true">→</span>
          </MarketsIntentLink>
        </div>
        <div>
          <h2>Catalysts</h2>
          <ul>{overview.memo.catalysts.map((item) => <li key={item}>{item}</li>)}</ul>
        </div>
        <div>
          <h2>Risks</h2>
          <ul className="market-risk-list">{overview.memo.risks.map((item) => <li key={item}>{item}</li>)}</ul>
        </div>
        <div>
          <h2>Watch items</h2>
          <ul>{overview.memo.watchItems.map((item) => <li key={item}>{item}</li>)}</ul>
        </div>
      </section>

      <footer className="market-overview-footer">
        <span>{feedLabel(overview.feed)} data · Data as of {formatMarketTime(overview.dataAsOf)}</span>
        <span>US equities · {overview.feed} feed{overview.stale ? ' · stale' : ''}</span>
      </footer>
    </article>
  )
}

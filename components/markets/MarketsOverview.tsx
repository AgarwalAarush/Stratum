'use client'

import Link from 'next/link'
import { ArrowDown, ArrowSquareOut, ArrowUp } from '@phosphor-icons/react'
import { useState } from 'react'
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
          <div key={instrument.id} className="market-instrument">
            <span className="market-instrument-label">{instrument.label}</span>
            <span>{instrument.value}</span>
            <span className={instrument.direction === 'up' ? 'market-positive' : 'market-negative'}>
              {instrument.change}
            </span>
          </div>
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
                  <span>{evidence.publishedAt}</span>
                  <ArrowSquareOut size={17} aria-hidden="true" />
                </a>
              )
            })}
          </div>
          <p className="market-evidence-count">1 of {overview.evidence.length} selected</p>
        </div>
      </section>

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
          <Link href="/markets/screener" className="market-open-screener">
            Open Screener <span aria-hidden="true">→</span>
          </Link>
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

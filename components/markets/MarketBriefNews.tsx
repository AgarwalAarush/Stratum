'use client'

import { ArrowRight, ArrowSquareOut } from '@phosphor-icons/react'
import { useEffect, useState } from 'react'
import { MarketsIntentLink } from './MarketsIntentLink'
import type { NewsItem } from '@/lib/types'

interface MarketBriefNewsResponse {
  items: NewsItem[]
}

interface MarketBriefNewsProps {
  relevantSymbols: string[]
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

/**
 * The source-linked feed is useful context, but collecting it can involve
 * several remote feeds. Never hold the durable market snapshot behind that
 * optional work: wait until the overview is interactive, then request the
 * independently cached feed.
 */
export function MarketBriefNews({ relevantSymbols }: MarketBriefNewsProps) {
  const [items, setItems] = useState<NewsItem[] | null>(null)

  const symbolKey = [...new Set(relevantSymbols
    .map((symbol) => symbol.trim().toUpperCase())
    .filter((symbol) => /^[A-Z][A-Z0-9.-]{0,11}$/.test(symbol)))]
    .sort()
    .join(',')

  useEffect(() => {
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      void fetch(`/api/markets/brief-news?symbols=${encodeURIComponent(symbolKey)}`, {
        signal: controller.signal,
      })
        .then(async (response) => response.ok ? await response.json() as MarketBriefNewsResponse : null)
        .then((response) => {
          if (!controller.signal.aborted) setItems(response?.items ?? [])
        })
        .catch(() => {
          if (!controller.signal.aborted) setItems([])
        })
    }, 700)

    // Let the route transition paint and hydrate before an optional request
    // competes for bandwidth or server capacity.
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [symbolKey])

  if (items !== null && items.length === 0) return null

  return (
    <section className="market-brief-news" aria-labelledby="market-brief-news-title" aria-busy={items === null}>
      <header className="market-section-heading">
        <div>
          <p className="markets-eyebrow">Live context</p>
          <h2 id="market-brief-news-title">News moving through the market</h2>
          <p>{items === null ? 'Loading source-linked context for the session.' : 'Source-linked context for the session. Open the original reporting before assigning causality.'}</p>
        </div>
        <MarketsIntentLink href="/markets/events">All events <ArrowRight size={15} aria-hidden="true" /></MarketsIntentLink>
      </header>
      {items === null ? <div className="market-brief-news-loading" aria-live="polite"><span /><span /><span /></div> : (
        <div className="market-brief-news-list">
          {items.map((item) => (
            <a key={item.id} href={item.url} target="_blank" rel="noreferrer">
              <span>{item.category ?? 'Markets'}</span>
              <strong>{item.title}</strong>
              <small>{item.source} · {formatEvidenceTime(item.publishedAt)}</small>
              <ArrowSquareOut size={15} aria-hidden="true" />
            </a>
          ))}
        </div>
      )}
    </section>
  )
}

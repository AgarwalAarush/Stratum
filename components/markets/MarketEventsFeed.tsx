'use client'

import { useEffect, useState } from 'react'
import { MarketsFeedPage } from './MarketsFeedPage'
import type { NewsItem } from '@/lib/types'

interface MarketEventsFeedProps {
  focusedSymbol: string
}

export function MarketEventsFeed({ focusedSymbol }: MarketEventsFeedProps) {
  const [items, setItems] = useState<NewsItem[] | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      void fetch(`/api/markets/events?symbol=${encodeURIComponent(focusedSymbol)}`, { signal: controller.signal })
        .then(async (response) => response.ok ? await response.json() as { items: NewsItem[] } : null)
        .then((response) => {
          if (!controller.signal.aborted) setItems(response?.items ?? [])
        })
        .catch(() => {
          if (!controller.signal.aborted) setItems([])
        })
    }, 500)
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [focusedSymbol])

  return <MarketsFeedPage
    eyebrow="Ranked event stream"
    title={focusedSymbol ? `${focusedSymbol} events and context` : 'Events requiring context'}
    description="Company news, filings, deals, earnings context, and macro releases in one evidence stream. Owned, watched, and actively researched names are promoted as portfolio state becomes available."
    items={items ?? []}
    emptyMessage="No verified event is inside the current lookback window."
    loading={items === null}
  />
}

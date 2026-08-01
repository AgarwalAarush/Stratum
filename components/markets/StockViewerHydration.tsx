'use client'

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

export function StockViewerHydration({
  symbol,
  technical,
  fundamentals,
}: {
  symbol: string
  technical: boolean
  fundamentals: boolean
}) {
  const router = useRouter()

  useEffect(() => {
    if (!technical && !fundamentals) return
    const controller = new AbortController()
    let refreshTimer: number | null = null
    void fetch('/api/markets/stocks/hydration', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ symbol, technical, fundamentals }),
      signal: controller.signal,
    }).then((response) => {
      if (!response.ok || controller.signal.aborted) return
      refreshTimer = window.setTimeout(() => router.refresh(), 15_000)
    }).catch(() => {
      // The viewer remains usable while background enrichment is unavailable.
    })
    return () => {
      controller.abort()
      if (refreshTimer !== null) window.clearTimeout(refreshTimer)
    }
  }, [fundamentals, router, symbol, technical])

  return null
}

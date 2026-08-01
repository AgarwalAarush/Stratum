'use client'

import { ArrowUpRight, MagnifyingGlass, X } from '@phosphor-icons/react'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { StockSearchResult } from '@/lib/markets/stock-search'

interface StockSearchResponse {
  results: StockSearchResult[]
}

const SEARCH_DELAY_MS = 140

function formatPrice(value: number): string {
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 })
}

function formatPercent(value: number): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`
}

export function StockSearch() {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const previousFocus = useRef<HTMLElement | null>(null)
  const controllerRef = useRef<AbortController | null>(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<StockSearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const close = useCallback(() => {
    controllerRef.current?.abort()
    setOpen(false)
    setQuery('')
    setResults([])
    setError('')
  }, [])

  const show = useCallback(() => {
    previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    setOpen(true)
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        if (!open) show()
        return
      }
      if (open && event.key === 'Escape') {
        event.preventDefault()
        close()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [close, open, show])

  useEffect(() => {
    if (!open) {
      previousFocus.current?.focus()
      previousFocus.current = null
      return
    }
    window.requestAnimationFrame(() => inputRef.current?.focus())
  }, [open])

  useEffect(() => {
    if (!open || !query.trim()) return
    const timeout = window.setTimeout(() => {
      controllerRef.current?.abort()
      const controller = new AbortController()
      controllerRef.current = controller
      setLoading(true)
      setError('')
      void fetch(`/api/markets/stocks/search?q=${encodeURIComponent(query)}`, { signal: controller.signal })
        .then(async (response) => {
          if (!response.ok) throw new Error('Search is temporarily unavailable.')
          return await response.json() as StockSearchResponse
        })
        .then((response) => {
          if (!controller.signal.aborted) setResults(response.results)
        })
        .catch((caught: unknown) => {
          if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : 'Search is temporarily unavailable.')
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false)
        })
    }, SEARCH_DELAY_MS)
    return () => window.clearTimeout(timeout)
  }, [open, query])

  const openStock = (symbol: string) => {
    close()
    router.push(`/markets/stocks/${symbol}`, { scroll: false })
  }

  const openResearch = (symbol: string) => {
    close()
    router.push(`/markets/stocks/${symbol}/research`)
  }

  const updateQuery = (value: string) => {
    if (!value.trim()) {
      controllerRef.current?.abort()
      setResults([])
      setLoading(false)
      setError('')
    }
    setQuery(value)
  }

  return (
    <>
      <button type="button" className="markets-stock-search-trigger" onClick={show} aria-label="Search stocks" aria-keyshortcuts="Meta+K Control+K">
        <MagnifyingGlass size={15} aria-hidden="true" />
        <span>Search stocks</span>
        <kbd>⌘K</kbd>
      </button>

      {open ? (
        <div className="markets-stock-search-layer" role="presentation" onMouseDown={close}>
          <section className="markets-stock-search-dialog" role="dialog" aria-modal="true" aria-labelledby="markets-stock-search-title" onMouseDown={(event) => event.stopPropagation()}>
            <header>
              <MagnifyingGlass size={18} aria-hidden="true" />
              <label id="markets-stock-search-title" htmlFor="markets-stock-search-input">Search stocks</label>
              <button type="button" onClick={close} aria-label="Close stock search"><X size={17} /></button>
            </header>
            <input
              ref={inputRef}
              id="markets-stock-search-input"
              type="search"
              autoComplete="off"
              value={query}
              onChange={(event) => updateQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && results[0]) {
                  event.preventDefault()
                  openStock(results[0].symbol)
                }
              }}
              placeholder="Ticker or company name"
              aria-describedby="markets-stock-search-help"
            />
            <p id="markets-stock-search-help" className="markets-stock-search-help">Enter opens the Stock Viewer. Research opens the full equity research page.</p>
            <div className="markets-stock-search-results" aria-live="polite">
              {!query.trim() ? <p>Search the current market universe by ticker or company.</p> : null}
              {loading ? <p>Searching current market data…</p> : null}
              {error ? <p role="alert">{error}</p> : null}
              {!loading && !error && query.trim() && results.length === 0 ? <p>No matching stock in the current universe.</p> : null}
              {results.map((result) => (
                <article key={result.symbol}>
                  <button type="button" className="markets-stock-search-result" onClick={() => openStock(result.symbol)}>
                    <span className="markets-stock-search-identity"><strong>{result.symbol}</strong><span>{result.company}</span></span>
                    <span className="markets-stock-search-quote"><strong>{formatPrice(result.price)}</strong><span className={result.dailyChange >= 0 ? 'market-positive' : 'market-negative'}>{formatPercent(result.dailyChange)}</span></span>
                  </button>
                  <button type="button" className="markets-stock-search-research" onClick={() => openResearch(result.symbol)} aria-label={`Open ${result.symbol} equity research`}>
                    Research <ArrowUpRight size={13} aria-hidden="true" />
                  </button>
                </article>
              ))}
            </div>
            <footer><span>Esc</span> close <span>↵</span> open Stock Viewer</footer>
          </section>
        </div>
      ) : null}
    </>
  )
}

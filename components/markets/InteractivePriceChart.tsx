'use client'

import { CaretDown, Check } from '@phosphor-icons/react'
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { historyForPeriod, priceHistoryPeriod, PRICE_HISTORY_PERIODS } from '@/lib/markets/price-history'
import type { ScreenerReturnField, StockPricePoint } from '@/lib/markets/types'

interface ChartPoint extends StockPricePoint {
  x: number
  y: number
}

function formatPrice(value: number): string {
  return value.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  })
}

function formatDate(value: string, includeYear = false): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    ...(includeYear ? { year: 'numeric' } : {}),
    timeZone: 'UTC',
  }).format(new Date(`${value}T00:00:00Z`))
}

function buildPoints(history: StockPricePoint[]): ChartPoint[] {
  const values = history.map((point) => point.close)
  const minimum = Math.min(...values)
  const maximum = Math.max(...values)
  const spread = Math.max(maximum - minimum, 1)

  return history.map((point, index) => ({
    ...point,
    x: (index / (history.length - 1)) * 100,
    y: 92 - ((point.close - minimum) / spread) * 82,
  }))
}

export function InteractivePriceChart({ history, symbol }: { history: StockPricePoint[]; symbol: string }) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null)
  const [period, setPeriod] = useState<ScreenerReturnField>('return1y')
  const [periodPickerOpen, setPeriodPickerOpen] = useState(false)
  const periodPickerRef = useRef<HTMLDivElement>(null)
  const displayedHistory = useMemo(() => historyForPeriod(history, period), [history, period])
  const selectedPeriod = priceHistoryPeriod(period)

  useEffect(() => {
    if (!periodPickerOpen) return
    const closeOnOutsidePointer = (event: globalThis.PointerEvent) => {
      if (!periodPickerRef.current?.contains(event.target as Node)) setPeriodPickerOpen(false)
    }
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') setPeriodPickerOpen(false)
    }
    document.addEventListener('pointerdown', closeOnOutsidePointer)
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePointer)
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [periodPickerOpen])

  if (displayedHistory.length < 2) {
    return <div className="stock-viewer-chart-empty">Price history is not available in the current snapshot.</div>
  }

  const points = buildPoints(displayedHistory)
  const active = activeIndex === null ? null : points[activeIndex]
  const midpoint = displayedHistory[Math.floor((displayedHistory.length - 1) / 2)]

  const selectFromPointer = (event: PointerEvent<SVGSVGElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect()
    const fraction = Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width))
    const nextIndex = Math.round(fraction * (points.length - 1))
    setActiveIndex((current) => current === nextIndex ? current : nextIndex)
  }

  const selectFromKeyboard = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    const current = activeIndex ?? points.length - 1
    setActiveIndex(event.key === 'ArrowLeft'
      ? Math.max(0, current - 1)
      : Math.min(points.length - 1, current + 1))
  }

  return (
    <div
      className="stock-price-chart"
      tabIndex={0}
      onFocus={() => setActiveIndex((current) => current ?? points.length - 1)}
      onBlur={() => setActiveIndex(null)}
      onKeyDown={selectFromKeyboard}
      aria-label={`${symbol} ${selectedPeriod.chartLabel}. Use left and right arrow keys to inspect daily closes.`}
    >
      <div className="stock-price-chart-heading">
        <div ref={periodPickerRef} className="stock-price-chart-period-picker">
          <button
            type="button"
            className="stock-price-chart-period-trigger"
            aria-haspopup="menu"
            aria-expanded={periodPickerOpen}
            aria-label="Price history period"
            onClick={() => setPeriodPickerOpen((current) => !current)}
          >
            <span>{selectedPeriod.chartLabel}</span>
            <CaretDown size={13} aria-hidden="true" />
          </button>
          {periodPickerOpen ? (
            <div className="stock-price-chart-period-menu" role="menu" aria-label="Price history period">
              {PRICE_HISTORY_PERIODS.map((candidate) => {
                const selected = candidate.id === period
                return (
                  <button
                    key={candidate.id}
                    type="button"
                    role="menuitemradio"
                    aria-checked={selected}
                    className={selected ? 'stock-price-chart-period-option-active' : ''}
                    onClick={() => {
                      setPeriod(candidate.id)
                      setActiveIndex(null)
                      setPeriodPickerOpen(false)
                    }}
                  >
                    <Check size={14} aria-hidden="true" />
                    <span>{candidate.label}</span>
                  </button>
                )
              })}
            </div>
          ) : null}
        </div>
        <strong>{active ? `${formatDate(active.tradingDate, true)} · ${formatPrice(active.close)}` : 'Hover to inspect'}</strong>
      </div>
      <div className="stock-price-chart-plot">
        <svg
          className="stock-viewer-chart"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          role="img"
          aria-label={`${symbol} ${selectedPeriod.chartLabel} closing-price chart`}
          onPointerMove={selectFromPointer}
          onPointerEnter={selectFromPointer}
          onPointerLeave={() => setActiveIndex(null)}
        >
          <line className="stock-chart-baseline" x1="0" x2="100" y1="92" y2="92" />
          <polyline points={points.map((point) => `${point.x},${point.y}`).join(' ')} vectorEffect="non-scaling-stroke" />
          {active ? (
            <>
              <line className="stock-chart-crosshair" x1={active.x} x2={active.x} y1="5" y2="92" vectorEffect="non-scaling-stroke" />
            </>
          ) : null}
        </svg>
        {active ? (
          <>
            <i className="stock-price-chart-point" style={{ left: `${active.x}%`, top: `${active.y}%` }} aria-hidden="true" />
            <div
              className={`stock-price-chart-tooltip ${active.y < 25 ? 'stock-price-chart-tooltip-below' : ''}`}
              style={{ left: `clamp(54px, ${active.x}%, calc(100% - 54px))`, top: `${active.y}%` }}
              aria-hidden="true"
            >
              <strong>{formatPrice(active.close)}</strong>
              <span>{formatDate(active.tradingDate, true)}</span>
            </div>
          </>
        ) : null}
      </div>
      <div className="stock-price-chart-axis" aria-hidden="true">
        <time>{formatDate(displayedHistory[0].tradingDate, true)}</time>
        <time>{formatDate(midpoint.tradingDate)}</time>
        <time>{formatDate(displayedHistory.at(-1)!.tradingDate, true)}</time>
      </div>
    </div>
  )
}

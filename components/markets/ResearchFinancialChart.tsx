'use client'

import { useMemo, useState, type PointerEvent } from 'react'

export interface ResearchFinancialPoint {
  label: string
  revenue: number | null
  operatingIncome: number | null
  freeCashFlow: number | null
}

type Metric = 'revenue' | 'operatingIncome' | 'freeCashFlow'

const METRICS: Array<{ id: Metric; label: string }> = [
  { id: 'revenue', label: 'Revenue' },
  { id: 'operatingIncome', label: 'Operating income' },
  { id: 'freeCashFlow', label: 'Free cash flow' },
]

function compactMoney(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value)
}

export function ResearchFinancialChart({
  points,
  symbol,
}: {
  points: ResearchFinancialPoint[]
  symbol: string
}) {
  const [metric, setMetric] = useState<Metric>('revenue')
  const [activeIndex, setActiveIndex] = useState<number | null>(null)
  const values = useMemo(() => points.map((point) => point[metric]), [metric, points])
  const finite = values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
  if (points.length < 2 || finite.length < 2) return null
  const minimum = Math.min(0, ...finite)
  const maximum = Math.max(0, ...finite)
  const spread = Math.max(maximum - minimum, 1)
  const zeroY = 88 - ((0 - minimum) / spread) * 74
  const barWidth = Math.min(9, 70 / points.length)
  const active = activeIndex === null ? null : points[activeIndex]
  const activeValue = active?.[metric]

  const selectFromPointer = (event: PointerEvent<SVGSVGElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect()
    const fraction = Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width))
    setActiveIndex(Math.round(fraction * (points.length - 1)))
  }

  return (
    <div className="research-financial-chart">
      <header>
        <div>
          <span>Quarterly financial trend</span>
          <strong>{active && typeof activeValue === 'number' ? `${active.label} · ${compactMoney(activeValue)}` : 'Hover to inspect'}</strong>
        </div>
        <div className="research-chart-tabs" role="group" aria-label="Financial chart metric">
          {METRICS.map((option) => (
            <button
              key={option.id}
              type="button"
              aria-pressed={metric === option.id}
              onClick={() => {
                setMetric(option.id)
                setActiveIndex(null)
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      </header>
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        role="img"
        aria-label={`${symbol} quarterly ${METRICS.find((option) => option.id === metric)?.label.toLowerCase()} chart`}
        onPointerEnter={selectFromPointer}
        onPointerMove={selectFromPointer}
        onPointerLeave={() => setActiveIndex(null)}
      >
        <line x1="0" x2="100" y1={zeroY} y2={zeroY} />
        {points.map((point, index) => {
          const value = point[metric]
          if (value === null) return null
          const valueY = 88 - ((value - minimum) / spread) * 74
          const x = 8 + (index / Math.max(points.length - 1, 1)) * 84
          return (
            <rect
              key={`${point.label}-${index}`}
              className={value >= 0 ? 'research-chart-positive' : 'research-chart-negative'}
              x={x - barWidth / 2}
              y={Math.min(valueY, zeroY)}
              width={barWidth}
              height={Math.max(1, Math.abs(zeroY - valueY))}
              opacity={activeIndex === null || activeIndex === index ? 1 : 0.35}
            />
          )
        })}
      </svg>
      <footer>
        {points.map((point, index) => (
          <span key={`${point.label}-${index}`}>{index === 0 || index === points.length - 1 || index === Math.floor(points.length / 2) ? point.label : ''}</span>
        ))}
      </footer>
    </div>
  )
}

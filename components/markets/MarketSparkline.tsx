interface MarketSparklineProps {
  values: number[]
  label: string
}

export function MarketSparkline({ values, label }: MarketSparklineProps) {
  const minimum = Math.min(...values)
  const maximum = Math.max(...values)
  const range = Math.max(maximum - minimum, 1)
  const points = values
    .map((value, index) => {
      const x = (index / Math.max(values.length - 1, 1)) * 84 + 2
      const y = 21 - ((value - minimum) / range) * 17
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
  const lastPoint = points.split(' ').at(-1)?.split(',') ?? ['86', '4']

  return (
    <svg viewBox="0 0 90 24" className="market-sparkline" role="img" aria-label={label}>
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth="1" vectorEffect="non-scaling-stroke" />
      <circle cx={lastPoint[0]} cy={lastPoint[1]} r="2.2" fill="var(--market-green)" />
    </svg>
  )
}

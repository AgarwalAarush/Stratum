import Link from 'next/link'
import type { StockPricePoint, StockViewerData } from '@/lib/markets/types'
import { CapitalDecisionRail } from './CapitalDecisionRail'
import { CandidateActions } from './CandidateActions'

function money(value: number): string {
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 })
}

function percent(value: number | null): string {
  return value === null ? '—' : `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`
}

function compact(value: unknown, style: 'number' | 'currency' = 'number'): string {
  return typeof value === 'number' && Number.isFinite(value)
    ? new Intl.NumberFormat('en-US', {
      notation: 'compact',
      maximumFractionDigits: 1,
      ...(style === 'currency' ? { style: 'currency', currency: 'USD' } : {}),
    }).format(value)
    : '—'
}

function multiple(value: number | null | undefined): string {
  return value === null || value === undefined ? '—' : `${value.toFixed(1)}×`
}

function StockHistoryChart({ history, symbol }: { history: StockPricePoint[]; symbol: string }) {
  if (history.length < 2) return <div className="stock-viewer-chart-empty">Price history is not available in the current snapshot.</div>
  const values = history.map((point) => point.close)
  const minimum = Math.min(...values)
  const maximum = Math.max(...values)
  const spread = Math.max(maximum - minimum, 1)
  const points = values.map((value, index) => {
    const x = (index / (values.length - 1)) * 100
    const y = 92 - ((value - minimum) / spread) * 82
    return `${x},${y}`
  }).join(' ')
  return (
    <svg className="stock-viewer-chart" viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label={`${symbol} one-year price history`}>
      <line x1="0" x2="100" y1="92" y2="92" />
      <polyline points={points} />
    </svg>
  )
}

export function StockViewer({ data }: { data: StockViewerData }) {
  const metric = data.leadership
  const candidate = data.candidate
  const packet = data.companyPacket
  const latestFinancials = packet?.fundamentals[0]
  const latestEstimate = packet?.estimates[0]
  const research = data.researchNote
  return (
    <article className="stock-viewer">
      <header className="stock-viewer-hero" id="overview">
        <div>
          <p className="markets-eyebrow">{data.exchange} · {data.sector} · {data.subIndustry}</p>
          <h1 className="markets-display">{data.company}</h1>
          <div className="stock-viewer-quote">
            <strong>{data.symbol}</strong>
            <span>{money(data.price)}</span>
            <span className={(data.dailyChange ?? 0) >= 0 ? 'market-positive' : 'market-negative'}>{percent(data.dailyChange)}</span>
          </div>
        </div>
        <div className="stock-viewer-provenance">
          <span>{data.feed === 'delayed_sip' ? 'Delayed SIP' : data.feed.toUpperCase()}</span>
          <time dateTime={data.dataAsOf}>As of {new Date(data.dataAsOf).toLocaleString('en-US', { timeZone: 'America/New_York' })}</time>
        </div>
      </header>

      <nav className="stock-viewer-outline" aria-label={`${data.symbol} page sections`}>
        {['Overview', 'Financials', 'Valuation', 'Industry Context', 'Earnings', 'Events', 'Research'].map((section) => (
          <a key={section} href={`#${section.toLowerCase().replaceAll(' ', '-')}`}>{section}</a>
        ))}
      </nav>

      <div className="stock-viewer-layout">
        <div className="stock-viewer-main">
          <section className="stock-viewer-chart-section">
            <StockHistoryChart history={data.history} symbol={data.symbol} />
            <div className="stock-viewer-stat-grid">
              <div><span>30d return</span><strong>{percent(metric?.return30d ?? null)}</strong></div>
              <div><span>1yr return</span><strong>{percent(metric?.return1y ?? null)}</strong></div>
              <div><span>vs 50d</span><strong>{percent(metric?.vs50DayAverage ?? null)}</strong></div>
              <div><span>vs 200d</span><strong>{percent(metric?.vs200DayAverage ?? null)}</strong></div>
              <div><span>Relative volume</span><strong>{data.relativeVolume === null ? '—' : `${data.relativeVolume.toFixed(1)}×`}</strong></div>
              <div><span>52-week position</span><strong>{data.fiftyTwoWeekPosition === null ? '—' : `${data.fiftyTwoWeekPosition.toFixed(0)}%`}</strong></div>
            </div>
          </section>

          <section className="stock-viewer-section" id="financials">
            <p className="markets-eyebrow">{packet ? `CompanyPacket v${packet.version} · ${new Date(packet.dataAsOf).toLocaleDateString()}` : 'Deterministic packet'}</p>
            <h2>Financials</h2>
            {latestFinancials ? (
              <div className="stock-viewer-stat-grid">
                <div><span>Revenue</span><strong>{compact(latestFinancials.revenue, 'currency')}</strong></div>
                <div><span>Net income</span><strong>{compact(latestFinancials.netIncome, 'currency')}</strong></div>
                <div><span>EPS</span><strong>{compact(latestFinancials.eps)}</strong></div>
                <div><span>Reported period</span><strong>{String(latestFinancials.calendarYear ?? latestFinancials.date ?? '—')}</strong></div>
              </div>
            ) : <p>Revenue, margins, cash flow, balance-sheet trends, and estimate history are assembled into the versioned CompanyPacket before full research runs.</p>}
          </section>

          <section className="stock-viewer-section" id="valuation">
            <p className="markets-eyebrow">Price versus expectations</p>
            <h2>Valuation</h2>
            {packet ? (
              <div className="stock-viewer-stat-grid">
                <div><span>P/E</span><strong>{multiple(packet.ratios.peRatio)}</strong></div>
                <div><span>Price / sales</span><strong>{multiple(packet.ratios.priceToSales)}</strong></div>
                <div><span>Return on equity</span><strong>{percent(packet.ratios.returnOnEquity === null ? null : packet.ratios.returnOnEquity * 100)}</strong></div>
                <div><span>Net margin</span><strong>{percent(packet.ratios.netMargin === null ? null : packet.ratios.netMargin * 100)}</strong></div>
              </div>
            ) : <p>{candidate?.valuationSnapshot ?? 'Current and historical valuation context will appear after the CompanyPacket is materialized.'}</p>}
          </section>

          <section className="stock-viewer-section" id="industry-context">
            <p className="markets-eyebrow">{data.subIndustry}</p>
            <h2>Industry Context</h2>
            <p>{candidate?.industryContext ?? `${data.symbol} is compared against equal-weight ${data.subIndustry} leadership, breadth, and constituent performance.`}</p>
          </section>

          <section className="stock-viewer-section" id="earnings">
            <p className="markets-eyebrow">Expectations and inflections</p>
            <h2>Earnings</h2>
            {latestEstimate ? (
              <div className="stock-viewer-stat-grid">
                <div><span>Estimate period</span><strong>{String(latestEstimate.date ?? latestEstimate.calendarYear ?? '—')}</strong></div>
                <div><span>Estimated revenue</span><strong>{compact(latestEstimate.estimatedRevenueAvg, 'currency')}</strong></div>
                <div><span>Estimated EPS</span><strong>{compact(latestEstimate.estimatedEpsAvg)}</strong></div>
                <div><span>Next catalyst</span><strong>{data.decision?.nextCatalyst ?? candidate?.catalyst ?? '—'}</strong></div>
              </div>
            ) : <p>{candidate?.catalyst ?? 'The next earnings event and estimate revisions will be shown from the normalized company packet.'}</p>}
          </section>

          <section className="stock-viewer-section" id="events">
            <p className="markets-eyebrow">Filings, news, and catalysts</p>
            <h2>Events</h2>
            {packet?.events.slice(0, 3).map((event) => (
              <p key={`${event.url}-${event.publishedAt}`}><a href={event.url} target="_blank" rel="noreferrer">{event.title}</a> · {new Date(event.publishedAt).toLocaleDateString()}</p>
            ))}
            <Link href={`/markets/events?symbol=${data.symbol}`}>Open events relevant to {data.symbol} →</Link>
          </section>

          <section className="stock-viewer-section stock-viewer-research-summary" id="research">
            <p className="markets-eyebrow">Equity research</p>
            <h2>{research?.keyDebate ?? (candidate ? 'Why this name surfaced' : 'No full thesis yet')}</h2>
            <p>{research?.mispricing ?? candidate?.whySurfaced ?? 'Generate a versioned research artifact when this name deserves capital-allocation work.'}</p>
            {candidate ? (
              <div className="stock-viewer-dimensions">
                {candidate.dimensions.map((dimension) => (
                  <div key={dimension.name}>
                    <span>{dimension.label}</span>
                    <strong data-assessment={dimension.assessment}>{dimension.assessment}</strong>
                    <p>{dimension.evidence}</p>
                  </div>
                ))}
              </div>
            ) : null}
            {candidate?.status === 'new' ? <CandidateActions candidateId={candidate.id} /> : null}
            <Link href={`/markets/stocks/${data.symbol}/research`}>Read full analysis →</Link>
          </section>
        </div>

        <CapitalDecisionRail
          symbol={data.symbol}
          initial={data.decision}
          research={data.researchNote}
          candidate={data.candidate}
        />
      </div>
    </article>
  )
}

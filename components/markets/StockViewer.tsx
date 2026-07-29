import type { StockViewerData } from '@/lib/markets/types'
import { CapitalDecisionRail } from './CapitalDecisionRail'
import { CandidateActions } from './CandidateActions'
import { InteractivePriceChart } from './InteractivePriceChart'
import { MarketsIntentLink } from './MarketsIntentLink'

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

export function StockViewer({ data }: { data: StockViewerData }) {
  const metric = data.leadership
  const candidate = data.candidate
  const packet = data.companyPacket
  const latestFinancials = packet?.fundamentals[0]
  const latestEstimate = packet?.estimates[0]
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
          <MarketsIntentLink
            className="stock-viewer-research-button"
            href={`/markets/stocks/${data.symbol}/research`}
          >
            Full equity research
          </MarketsIntentLink>
        </div>
        <div className="stock-viewer-provenance">
          <span>{data.feed === 'delayed_sip' ? 'Delayed SIP' : data.feed.toUpperCase()}</span>
          <time dateTime={data.dataAsOf}>As of {new Date(data.dataAsOf).toLocaleString('en-US', { timeZone: 'America/New_York' })}</time>
        </div>
      </header>

      <nav className="stock-viewer-outline" aria-label={`${data.symbol} page sections`}>
        {['Overview', 'Financials', 'Valuation', 'Industry Context', 'Earnings', 'Events'].map((section) => (
          <a key={section} href={`#${section.toLowerCase().replaceAll(' ', '-')}`}>{section}</a>
        ))}
      </nav>

      <div className="stock-viewer-layout">
        <div className="stock-viewer-main">
          <section className="stock-viewer-chart-section">
            <InteractivePriceChart history={data.history} symbol={data.symbol} />
            <div className="stock-viewer-stat-grid">
              <div><span>30d return</span><strong>{percent(metric?.return30d ?? null)}</strong></div>
              <div><span>1yr return</span><strong>{percent(metric?.return1y ?? null)}</strong></div>
              <div><span>vs 50d</span><strong>{percent(metric?.vs50DayAverage ?? null)}</strong></div>
              <div><span>vs 200d</span><strong>{percent(metric?.vs200DayAverage ?? null)}</strong></div>
              <div><span>Relative volume</span><strong>{data.relativeVolume === null ? '—' : `${data.relativeVolume.toFixed(1)}×`}</strong></div>
              <div><span>52-week position</span><strong>{data.fiftyTwoWeekPosition === null ? '—' : `${data.fiftyTwoWeekPosition.toFixed(0)}%`}</strong></div>
            </div>
          </section>

          <div className="stock-viewer-insight-grid">
            <section className="stock-viewer-section stock-viewer-section-compact" id="financials">
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

            <section className="stock-viewer-section stock-viewer-section-compact" id="valuation">
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

            <section className="stock-viewer-section stock-viewer-section-compact" id="industry-context">
              <p className="markets-eyebrow">{data.subIndustry}</p>
              <h2>Industry Context</h2>
              <p>{candidate?.industryContext ?? `${data.symbol} is compared against equal-weight ${data.subIndustry} leadership, breadth, and constituent performance.`}</p>
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
            </section>

            <section className="stock-viewer-section stock-viewer-section-compact" id="earnings">
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

            <section className="stock-viewer-section stock-viewer-section-compact stock-viewer-events" id="events">
              <p className="markets-eyebrow">Filings, news, and catalysts</p>
              <h2>Events</h2>
              {packet?.events.slice(0, 3).map((event) => (
                <p key={`${event.url}-${event.publishedAt}`}><a href={event.url} target="_blank" rel="noreferrer">{event.title}</a> · {new Date(event.publishedAt).toLocaleDateString()}</p>
              ))}
              <MarketsIntentLink href={`/markets/events?symbol=${data.symbol}`}>Open events relevant to {data.symbol} →</MarketsIntentLink>
            </section>
          </div>
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

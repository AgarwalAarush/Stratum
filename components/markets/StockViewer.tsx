import type { StockViewerData } from '@/lib/markets/types'
import { CapitalDecisionRail } from './CapitalDecisionRail'
import { CandidateActions } from './CandidateActions'
import { InteractivePriceChart } from './InteractivePriceChart'
import { MarketsIntentLink } from './MarketsIntentLink'
import { StockViewerHydration } from './StockViewerHydration'

function money(value: number | null): string {
  if (value === null) return '—'
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

function hasHistoryFor(data: StockViewerData, days: number): boolean {
  const oldest = data.history[0]
  if (!oldest) return false
  const cutoff = new Date(data.dataAsOf)
  if (!Number.isFinite(cutoff.getTime())) return false
  cutoff.setUTCDate(cutoff.getUTCDate() - days + 7)
  const oldestDate = new Date(`${oldest.tradingDate}T00:00:00.000Z`)
  return Number.isFinite(oldestDate.getTime()) && oldestDate <= cutoff
}

export function StockViewer({ data }: { data: StockViewerData }) {
  const metric = {
    return30d: hasHistoryFor(data, 30) ? data.return30d ?? data.leadership?.return30d ?? null : null,
    return1y: hasHistoryFor(data, 365) ? data.return1y ?? data.leadership?.return1y ?? null : null,
    vs50DayAverage: data.price === null || data.fiftyDayAverage === null || data.fiftyDayAverage === 0
      ? data.leadership?.vs50DayAverage ?? null
      : (data.price / data.fiftyDayAverage - 1) * 100,
    vs200DayAverage: data.leadership?.vs200DayAverage ?? null,
  }
  const candidate = data.candidate
  const thesis = data.thesis
  const isEtf = data.instrumentType === 'etf'
  const packet = data.companyPacket
  const latestFinancials = packet?.fundamentals[0]
  const latestEstimate = packet?.estimates[0]
  const needsTechnicalHydration = data.dailyChange === null || data.fiftyDayAverage === null
  const needsFundamentalsHydration = !isEtf && packet === null
  return (
    <article className="stock-viewer">
      <StockViewerHydration
        symbol={data.symbol}
        technical={needsTechnicalHydration}
        fundamentals={needsFundamentalsHydration}
      />
      <header className="stock-viewer-hero" id="overview">
        <div>
          <p className="markets-eyebrow">{data.exchange} · {data.sector} · {data.subIndustry}</p>
          <h1 className="markets-display">{data.company}</h1>
          <div className="stock-viewer-quote">
            <strong>{data.symbol}</strong>
            <span>{money(data.price)}</span>
            {data.priceSource === 'daily_close' ? <small>Most recent close</small> : null}
            {data.priceSource === 'unavailable' ? <small>Quote unavailable</small> : null}
            <span className={(data.dailyChange ?? 0) >= 0 ? 'market-positive' : 'market-negative'}>{percent(data.dailyChange)}</span>
          </div>
          <a
            className="stock-viewer-research-button"
            href={`/markets/stocks/${data.symbol}/research`}
          >
            {isEtf ? 'Full ETF research' : 'Full equity research'}
          </a>
        </div>
        <div className="stock-viewer-provenance">
          <span>{data.feed === 'delayed_sip' ? 'Delayed SIP' : data.feed.toUpperCase()}</span>
          <time dateTime={data.dataAsOf}>As of {new Date(data.dataAsOf).toLocaleString('en-US', { timeZone: 'America/New_York' })}</time>
        </div>
      </header>

      <nav className="stock-viewer-outline" aria-label={`${data.symbol} page sections`}>
        {[
          'Overview',
          ...(candidate ? ['Candidate Brief'] : []),
          ...(isEtf
            ? ['Fund Structure', 'Portfolio Exposure', 'ETF Research']
            : ['Financials', 'Valuation', 'Industry Context', 'Earnings']),
          'Events',
        ].map((section) => (
          <a key={section} href={`#${section.toLowerCase().replaceAll(' ', '-')}`}>{section}</a>
        ))}
      </nav>

      <div className="stock-viewer-layout">
        <div className="stock-viewer-main">
          <section className="stock-viewer-chart-section">
            <InteractivePriceChart history={data.history} symbol={data.symbol} />
            <div className="stock-viewer-stat-grid">
              <div><span>30d return</span><strong>{percent(metric.return30d)}</strong></div>
              <div><span>1yr return</span><strong>{percent(metric.return1y)}</strong></div>
              <div><span>vs 50d</span><strong>{percent(metric.vs50DayAverage)}</strong></div>
              <div><span>vs 200d</span><strong>{percent(metric.vs200DayAverage)}</strong></div>
              <div><span>Relative volume</span><strong>{data.relativeVolume === null ? '—' : `${data.relativeVolume.toFixed(1)}×`}</strong></div>
              <div><span>52-week position</span><strong>{data.fiftyTwoWeekPosition === null ? '—' : `${data.fiftyTwoWeekPosition.toFixed(0)}%`}</strong></div>
            </div>
          </section>

          {candidate ? (
            <section className="stock-viewer-section stock-viewer-candidate-brief" id="candidate-brief" aria-labelledby="candidate-brief-title">
              <div className="stock-viewer-section-heading">
                <div>
                  <p className="markets-eyebrow">Candidate Scout · partial brief · {candidate.primaryLane.replaceAll('_', ' ')}</p>
                  <h2 id="candidate-brief-title">Why {data.symbol} was surfaced</h2>
                </div>
                <time dateTime={candidate.generatedAt}>{new Date(candidate.generatedAt).toLocaleDateString()}</time>
              </div>
              <p className="stock-viewer-candidate-lead">{candidate.whySurfaced}</p>
              <div className="stock-viewer-candidate-grid">
                <div>
                  <span>What changed</span>
                  <ul>{candidate.whatChanged.slice(0, 4).map((item) => <li key={item}>{item}</li>)}</ul>
                </div>
                <div>
                  <span>Question before acting</span>
                  <p>{candidate.entryContext}</p>
                  <strong>{candidate.nextResearchQuestion}</strong>
                </div>
                <div>
                  <span>Lightweight risk check</span>
                  <ul>{candidate.redFlags.slice(0, 3).map((item) => <li key={item}>{item}</li>)}</ul>
                </div>
              </div>
              <div className="stock-viewer-stat-grid stock-viewer-candidate-numbers">
                {candidate.decisiveNumbers.slice(0, 6).map((item) => (
                  <div key={item.label}><span>{item.label}</span><strong>{item.value}</strong></div>
                ))}
              </div>
              <footer className="stock-viewer-candidate-sources">
                <span>Screening evidence—not a completed investment opinion.</span>
                {candidate.evidence.map((item) => (
                  <a key={item.url} href={item.url} target="_blank" rel="noreferrer">{item.label} ↗</a>
                ))}
              </footer>
            </section>
          ) : null}

          <section className="stock-viewer-section stock-viewer-thesis" aria-labelledby="stock-thesis-title">
            <div className="stock-viewer-section-heading">
              <div>
                <p className="markets-eyebrow">Versioned investment view</p>
                <h2 id="stock-thesis-title">Current thesis</h2>
              </div>
              <MarketsIntentLink href="/markets/theses">Open thesis library →</MarketsIntentLink>
            </div>
            {thesis ? (
              <div className="stock-viewer-thesis-copy">
                <strong>{thesis.content.headline}</strong>
                <p>{thesis.content.summary}</p>
                <small>Accepted v{thesis.version} · {new Date(thesis.reviewedAt ?? thesis.generatedAt).toLocaleDateString()}</small>
              </div>
            ) : (
              <p>No accepted thesis yet. Complete or refresh research to create a reviewable proposal; the screen will never silently change your current view.</p>
            )}
          </section>

          <div className="stock-viewer-insight-grid">
            {isEtf ? (
              <section className="stock-viewer-section stock-viewer-section-compact" id="fund-structure">
                <p className="markets-eyebrow">Fund vehicle, benchmark, and rules</p>
                <h2>Fund structure</h2>
                <p>{data.etfResearchNote?.sections.find((section) => section.id === 'fund_snapshot')?.content
                  ?? 'Issuer-verified holdings, benchmark, fees, and rebalancing rules are collected before ETF research runs.'}</p>
              </section>
            ) : null}

            {!isEtf ? <section className="stock-viewer-section stock-viewer-section-compact" id="financials">
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
            </section> : null}

            {!isEtf ? <section className="stock-viewer-section stock-viewer-section-compact" id="valuation">
              <p className="markets-eyebrow">Price versus expectations</p>
              <h2>Valuation</h2>
              {packet ? (
                <div className="stock-viewer-stat-grid">
                  <div><span>P/E</span><strong>{multiple(packet.ratios.peRatio)}</strong></div>
                  <div><span>Next FY P/E</span><strong>{multiple(packet.forwardEstimate?.forwardPe ?? packet.ratios.forwardPe ?? candidate?.forwardPe)}</strong></div>
                  <div><span>Price / sales</span><strong>{multiple(packet.ratios.priceToSales)}</strong></div>
                  <div><span>Return on equity</span><strong>{percent(packet.ratios.returnOnEquity === null ? null : packet.ratios.returnOnEquity * 100)}</strong></div>
                  <div><span>Net margin</span><strong>{percent(packet.ratios.netMargin === null ? null : packet.ratios.netMargin * 100)}</strong></div>
                </div>
              ) : candidate ? (
                <>
                  <div className="stock-viewer-stat-grid">
                    <div><span>Next FY P/E</span><strong>{multiple(candidate.forwardPe)}</strong></div>
                    <div><span>Estimate period</span><strong>{candidate.forwardEstimateDate ?? '—'}</strong></div>
                  </div>
                  <p>{candidate.valuationSnapshot}</p>
                </>
              ) : <p>Current and historical valuation context will appear after the CompanyPacket is materialized.</p>}
            </section> : null}

            {isEtf ? (
              <section className="stock-viewer-section stock-viewer-section-compact" id="portfolio-exposure">
                <p className="markets-eyebrow">Look-through portfolio analysis</p>
                <h2>Portfolio exposure</h2>
                <p>{data.etfResearchNote?.sections.find((section) => section.id === 'portfolio_exposure')?.content
                  ?? 'The ETF report will show the top holdings, concentration, classification exposure, and changes from the issuer’s previous holdings snapshot.'}</p>
                <a href={`/markets/stocks/${data.symbol}/research`}>Open the holdings table →</a>
              </section>
            ) : null}

            <section className="stock-viewer-section stock-viewer-section-compact" id={isEtf ? 'etf-research' : 'industry-context'}>
              <p className="markets-eyebrow">{candidate?.primaryLane
                ? candidate.primaryLane.replaceAll('_', ' ')
                : data.subIndustry}</p>
              <h2>{isEtf ? 'ETF research' : 'Industry Context'}</h2>
              {candidate?.entryContext ? <p><strong>Entry question:</strong> {candidate.entryContext}</p> : null}
              {candidate?.selloff ? (
                <div className="stock-viewer-stat-grid">
                  <div><span>One day</span><strong>{percent(candidate.selloff.day)}</strong></div>
                  <div><span>One week</span><strong>{percent(candidate.selloff.fiveDay)}</strong></div>
                  <div><span>One month</span><strong>{percent(candidate.selloff.thirtyDay)}</strong></div>
                </div>
              ) : null}
              <p>{candidate?.industryContext ?? (isEtf
                ? 'Corporate financial statements, earnings calls, and a company forward P/E are intentionally excluded. The research evaluates the fund’s actual portfolio and exposure.'
                : `${data.symbol} is compared against equal-weight ${data.subIndustry} leadership, breadth, and constituent performance.`)}</p>
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

            {!isEtf ? <section className="stock-viewer-section stock-viewer-section-compact" id="earnings">
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
            </section> : null}

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
          research={isEtf ? data.etfResearchNote : data.researchNote}
          candidate={data.candidate}
          instrumentType={data.instrumentType}
        />
      </div>
    </article>
  )
}

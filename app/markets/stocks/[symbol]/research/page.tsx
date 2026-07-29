import Link from 'next/link'
import { notFound } from 'next/navigation'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { InteractivePriceChart } from '@/components/markets/InteractivePriceChart'
import { ResearchActionButton } from '@/components/markets/ResearchActionButton'
import {
  ResearchFinancialChart,
  type ResearchFinancialPoint,
} from '@/components/markets/ResearchFinancialChart'
import { requireAllowedMarketUser } from '@/lib/auth/markets-session'
import { formatMarketDate } from '@/lib/markets/format-date'
import type { CompanyPacket } from '@/lib/markets/types'
import { fetchStockViewerData } from '@/lib/server/markets-repository'

function numeric(record: Record<string, unknown>, key: string): number | null {
  const value = record[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function compactMoney(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value)
}

function money(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—'
  return value.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  })
}

function percent(value: number | null | undefined, fraction = false): string {
  if (value === null || value === undefined) return '—'
  const normalized = fraction ? value * 100 : value
  return `${normalized >= 0 ? '+' : ''}${normalized.toFixed(1)}%`
}

function multiple(value: number | null | undefined): string {
  return value === null || value === undefined ? '—' : `${value.toFixed(1)}×`
}

function statementDate(row: Record<string, unknown>): string {
  return String(row.date ?? row.calendarYear ?? row.fiscalYear ?? '')
}

function financialPoints(packet: CompanyPacket | null): ResearchFinancialPoint[] {
  if (!packet) return []
  const income = packet.financialStatements?.incomeQuarterly.length
    ? packet.financialStatements.incomeQuarterly
    : packet.fundamentals.filter((row) => numeric(row, 'revenue') !== null).slice(0, 8)
  const cash = packet.financialStatements?.cashFlowQuarterly.length
    ? packet.financialStatements.cashFlowQuarterly
    : packet.fundamentals.filter((row) => numeric(row, 'freeCashFlow') !== null).slice(0, 8)
  const cashByDate = new Map(cash.map((row) => [statementDate(row), row]))
  return income
    .slice(0, 8)
    .map((row) => {
      const date = statementDate(row)
      const year = String(row.calendarYear ?? row.fiscalYear ?? date.slice(0, 4))
      const period = String(row.period ?? '')
      return {
        label: `${year}${period && period !== year ? ` ${period}` : ''}`,
        revenue: numeric(row, 'revenue'),
        operatingIncome: numeric(row, 'operatingIncome'),
        freeCashFlow: numeric(cashByDate.get(date) ?? {}, 'freeCashFlow'),
      }
    })
    .reverse()
}

function estimateRows(packet: CompanyPacket | null) {
  return (packet?.estimates ?? [])
    .filter((row) => numeric(row, 'estimatedRevenueAvg') !== null || numeric(row, 'estimatedEpsAvg') !== null)
    .slice(0, 5)
}

export default async function EquityResearchPage({ params }: { params: Promise<{ symbol: string }> }) {
  const [{ symbol: rawSymbol }, user] = await Promise.all([params, requireAllowedMarketUser()])
  const symbol = rawSymbol.toUpperCase()
  const stock = await fetchStockViewerData(symbol, user.id)
  if (!stock) notFound()
  const research = stock.researchNote
  const packet = stock.companyPacket
  const chartPoints = financialPoints(packet)
  const estimates = estimateRows(packet)
  const sources = packet?.sources.filter((source) => research?.sourceIds.includes(source.id)) ?? []
  const confidence = research && research.confidence <= 1 ? research.confidence * 100 : research?.confidence

  return (
    <article className="equity-research-note">
      <header className="equity-research-header">
        <div>
          <p className="markets-eyebrow">Equity research · GARP · 12-month valuation / 1–2 year ownership</p>
          <h1 className="markets-display">{stock.company}</h1>
          <p>{symbol} · {stock.sector} · Data as of {formatMarketDate(research?.dataAsOf ?? stock.dataAsOf)}</p>
        </div>
        <div className="equity-research-header-actions">
          <Link href={`/markets/stocks/${symbol}`}>← Stock Viewer</Link>
          {research?.status === 'complete' ? <ResearchActionButton symbol={symbol} hasResearch /> : null}
        </div>
      </header>

      {!research || research.status !== 'complete' ? (
        <section className="equity-research-empty">
          <p className="markets-eyebrow">{research?.status === 'failed' ? 'Last generation failed' : research ? 'Background job in progress' : 'No report yet'}</p>
          <h2>{research ? `Research version ${research.version} is ${research.status}.` : 'Generate the full, versioned equity-research report.'}</h2>
          {research?.error ? <p>{research.error}</p> : null}
          <ResearchActionButton symbol={symbol} hasResearch={Boolean(research)} />
        </section>
      ) : (
        <>
          <section className="equity-research-executive-strip" aria-label="Research decision summary">
            <div><span>Formal rating</span><strong data-rating={research.formalRating}>{research.formalRating}</strong><small>12-month view</small></div>
            <div><span>Entry decision</span><strong>{research.entryAction.replaceAll('_', ' ')}</strong><small>What to do today</small></div>
            <div><span>Current price</span><strong>{money(stock.price)}</strong><small>{percent(stock.dailyChange)} today</small></div>
            <div><span>Base fair value</span><strong>{money(research.fairValue)}</strong><small>{research.fairValue ? `${percent((research.fairValue / stock.price - 1) * 100)} implied` : 'Not established'}</small></div>
            <div><span>Entry zone</span><strong>{research.entryZoneLow === null ? '—' : `${money(research.entryZoneLow)}–${money(research.entryZoneHigh)}`}</strong><small>Risk/reward threshold</small></div>
            <div><span>Conviction</span><strong>{confidence?.toFixed(0)}%</strong><small>Evidence confidence</small></div>
          </section>

          <section className="equity-research-debate-grid" aria-label="Executive read">
            <div><span>Key debate</span><p>{research.keyDebate}</p></div>
            <div><span>Mispricing</span><p>{research.mispricing}</p></div>
            <div><span>Fastest kill signal</span><p>{research.fastestKillSignal}</p></div>
            <div><span>Entry decision</span><p>{research.entryAction.replaceAll('_', ' ')}</p></div>
          </section>

          <section className="equity-research-visuals" aria-labelledby="research-evidence-title">
            <header>
              <div>
                <p className="markets-eyebrow">Deterministic evidence</p>
                <h2 id="research-evidence-title">The numbers behind the thesis</h2>
              </div>
              <span>Charts are sourced from the CompanyPacket—not generated prose.</span>
            </header>
            <div className="equity-research-chart-grid">
              <article className="equity-research-chart-card equity-research-price-card">
                <InteractivePriceChart history={stock.history} symbol={symbol} />
              </article>
              <article className="equity-research-chart-card">
                {chartPoints.length > 1
                  ? <ResearchFinancialChart points={chartPoints} symbol={symbol} />
                  : <p className="research-data-unavailable">Quarterly history will appear after the refreshed CompanyPacket is published.</p>}
              </article>
              <article className="equity-research-chart-card research-context-card">
                <header><span>Price and group context</span><strong>Relative setup</strong></header>
                <dl>
                  <div><dt>30-day return</dt><dd>{percent(stock.leadership?.return30d)}</dd></div>
                  <div><dt>1-year return</dt><dd>{percent(stock.leadership?.return1y)}</dd></div>
                  <div><dt>vs. 50-day average</dt><dd>{percent(stock.leadership?.vs50DayAverage)}</dd></div>
                  <div><dt>vs. 200-day average</dt><dd>{percent(stock.leadership?.vs200DayAverage)}</dd></div>
                  <div><dt>{stock.subIndustry} · 30 days</dt><dd>{percent(packet?.industryContext.groupReturn30d)}</dd></div>
                  <div><dt>{stock.subIndustry} · 1 year</dt><dd>{percent(packet?.industryContext.groupReturn1y)}</dd></div>
                </dl>
              </article>
              <article className="equity-research-chart-card research-valuation-card">
                <header><span>Valuation snapshot</span><strong>Price versus fundamentals</strong></header>
                <div>
                  <dl>
                    <div><dt>P / E</dt><dd>{multiple(packet?.ratios.peRatio)}</dd></div>
                    <div><dt>Price / sales</dt><dd>{multiple(packet?.ratios.priceToSales)}</dd></div>
                    <div><dt>EV / EBITDA</dt><dd>{multiple(packet?.ratios.enterpriseValueToEbitda)}</dd></div>
                    <div><dt>FCF yield</dt><dd>{percent(packet?.ratios.freeCashFlowYield, true)}</dd></div>
                    <div><dt>Net margin</dt><dd>{percent(packet?.ratios.netMargin, true)}</dd></div>
                    <div><dt>Debt / equity</dt><dd>{multiple(packet?.ratios.debtToEquity)}</dd></div>
                  </dl>
                </div>
              </article>
            </div>
            {estimates.length > 0 ? (
              <div className="research-estimates-table">
                <header><span>Forward estimates</span><strong>Consensus expectations embedded in the packet</strong></header>
                <table>
                  <thead><tr><th>Period</th><th>Revenue estimate</th><th>EPS estimate</th><th>Revenue range</th><th>EPS range</th></tr></thead>
                  <tbody>
                    {estimates.map((row) => (
                      <tr key={String(row.date ?? row.calendarYear)}>
                        <td>{String(row.date ?? row.calendarYear ?? '—')}</td>
                        <td>{compactMoney(numeric(row, 'estimatedRevenueAvg'))}</td>
                        <td>{numeric(row, 'estimatedEpsAvg')?.toFixed(2) ?? '—'}</td>
                        <td>{compactMoney(numeric(row, 'estimatedRevenueLow'))}–{compactMoney(numeric(row, 'estimatedRevenueHigh'))}</td>
                        <td>{numeric(row, 'estimatedEpsLow')?.toFixed(2) ?? '—'}–{numeric(row, 'estimatedEpsHigh')?.toFixed(2) ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </section>

          <div className="equity-research-body">
            <nav aria-label="Research sections">
              <p>Full analysis</p>
              {research.sections.map((section, index) => <a key={section.id} href={`#${section.id}`}><span>{String(index + 1).padStart(2, '0')}</span>{section.title}</a>)}
            </nav>
            <div className="equity-research-sections">
              {research.sections.map((section, index) => {
                const sectionSources = packet?.sources.filter((source) => section.sourceIds.includes(source.id)) ?? []
                return (
                  <section key={section.id} id={section.id}>
                    <p className="markets-eyebrow">Section {String(index + 1).padStart(2, '0')} of 15</p>
                    <h2>{section.title}</h2>
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{section.content}</ReactMarkdown>
                    {sectionSources.length > 0 ? (
                      <footer>
                        <span>Evidence</span>
                        {sectionSources.map((source) => (
                          <a key={source.id} href={source.url} target="_blank" rel="noreferrer">{source.label} ↗</a>
                        ))}
                      </footer>
                    ) : <small>No section-specific source was attached; treat unsupported claims as analyst view.</small>}
                  </section>
                )
              })}
            </div>
          </div>

          <section className="equity-research-sources" aria-labelledby="research-sources-title">
            <header><p className="markets-eyebrow">Evidence ledger</p><h2 id="research-sources-title">Sources used in version {research.version}</h2></header>
            {sources.length > 0 ? sources.map((source) => (
              <a key={source.id} href={source.url} target="_blank" rel="noreferrer">
                <span>{source.source}</span>
                <strong>{source.label}</strong>
                <time dateTime={source.asOf}>{formatMarketDate(source.asOf)}</time>
              </a>
            )) : <p>No source ledger was attached to this legacy report version. Refresh the report to regenerate against the expanded packet.</p>}
          </section>

          <footer className="equity-research-footer">
            <span>Version {research.version} · {research.provider}/{research.model} · Generated {formatMarketDate(research.generatedAt)}</span>
            <ResearchActionButton symbol={symbol} hasResearch />
          </footer>
        </>
      )}
    </article>
  )
}

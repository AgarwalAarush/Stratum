import Link from 'next/link'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { InteractivePriceChart } from '@/components/markets/InteractivePriceChart'
import { formatMarketDate } from '@/lib/markets/format-date'
import { formatEntryAction, researchEvidenceMarkdown, researchMemoMarkdown } from '@/lib/markets/research-presentation'
import type { EtfResearchNote, EtfResearchPacket, StockViewerData } from '@/lib/markets/types'
import { ResearchActionButton } from './ResearchActionButton'
import { ResearchEvidenceToggle } from './ResearchEvidenceToggle'

function money(value: number | null): string {
  if (value === null) return '—'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1 }).format(value)
}

function percent(value: number | null, fraction = false): string {
  if (value === null) return '—'
  const result = fraction ? value * 100 : value
  return `${result >= 0 ? '+' : ''}${result.toFixed(1)}%`
}

function sourceFor(packet: EtfResearchPacket | null, sourceIds: string[]) {
  return packet?.sources.filter((source) => sourceIds.includes(source.id)) ?? []
}

export function EtfResearchReport({
  stock,
  packet,
  research,
}: {
  stock: StockViewerData
  packet: EtfResearchPacket | null
  research: EtfResearchNote | null
}) {
  const complete = research?.status === 'complete'
  const confidence = research && research.confidence <= 1 ? research.confidence * 100 : research?.confidence
  return (
    <article className="equity-research-note etf-research-note" data-research-presentation>
      <header className="equity-research-header">
        <div>
          <p className="markets-eyebrow">ETF research · portfolio exposure · capital allocation</p>
          <h1 className="markets-display">{stock.company}</h1>
          <p>{stock.symbol} · {stock.exchange} · issuer-held portfolio data as of {formatMarketDate(packet?.dataAsOf ?? stock.dataAsOf)}</p>
        </div>
        <div className="equity-research-header-actions">
          <Link href={`/markets/stocks/${stock.symbol}`}>← Stock Viewer</Link>
          {complete ? <ResearchEvidenceToggle /> : null}
          {complete ? <ResearchActionButton symbol={stock.symbol} hasResearch currentVersion={research.version} instrumentType="etf" /> : null}
        </div>
      </header>

      {!complete ? (
        <section className="equity-research-empty">
          <p className="markets-eyebrow">{research?.status === 'failed' ? 'Last ETF generation failed' : research ? 'Issuer packet is being prepared' : 'No ETF report yet'}</p>
          <h2>{research ? `ETF research version ${research.version} is ${research.status}.` : 'Generate a versioned, issuer-backed ETF research report.'}</h2>
          <p>Fund holdings, benchmark mechanics, concentration, and portfolio changes are gathered before analysis. Corporate financial statements and earnings are excluded.</p>
          {research?.error ? <p>{research.error}</p> : null}
          <ResearchActionButton symbol={stock.symbol} hasResearch={Boolean(research)} currentVersion={research?.version} instrumentType="etf" />
        </section>
      ) : (
        <>
          <section className="equity-research-executive-strip" aria-label="ETF research decision summary">
            <div><span>Formal rating</span><strong data-rating={research.formalRating}>{research.formalRating}</strong><small>Fund-level view</small></div>
            <div><span>Entry decision</span><strong>{formatEntryAction(research.entryAction)}</strong><small>What to do today</small></div>
            <div><span>Current price</span><strong>{money(stock.price)}</strong><small>{percent(stock.dailyChange)} today</small></div>
            <div><span>Top 10 weight</span><strong>{percent(packet?.topTenWeight ?? null, true)}</strong><small>Issuer holdings snapshot</small></div>
            <div><span>Fund assets</span><strong>{money(packet?.assetsUnderManagement ?? null)}</strong><small>Reported by issuer</small></div>
            <div><span>Confidence</span><strong>{confidence?.toFixed(0) ?? '—'}%</strong><small>Evidence confidence</small></div>
          </section>

          <section className="etf-research-overview" aria-labelledby="etf-portfolio-title">
            <header>
              <div><p className="markets-eyebrow">Deterministic issuer evidence</p><h2 id="etf-portfolio-title">Fund construction</h2></div>
              <span>Packet v{packet?.version ?? '—'}</span>
            </header>
            <dl>
              <div><dt>Issuer</dt><dd>{packet?.issuer ?? '—'}</dd></div>
              <div><dt>Benchmark</dt><dd>{packet?.benchmark ?? 'Not disclosed in packet'}</dd></div>
              <div><dt>Expense ratio</dt><dd>{percent(packet?.expenseRatio ?? null, true)}</dd></div>
              <div><dt>Rebalance</dt><dd>{packet?.rebalanceFrequency ?? 'Not disclosed in packet'}</dd></div>
              <div><dt>Holdings</dt><dd>{packet?.holdingsCount ?? '—'}</dd></div>
              <div><dt>30-day return</dt><dd>{percent(packet?.priceHistory.return30d ?? null)}</dd></div>
            </dl>
          </section>

          <section className="etf-research-holdings" aria-labelledby="etf-holdings-title">
            <header>
              <div><p className="markets-eyebrow">Issuer holdings snapshot</p><h2 id="etf-holdings-title">What the fund owns</h2></div>
              <span>Effective {formatMarketDate(packet?.dataAsOf ?? stock.dataAsOf)}</span>
            </header>
            {packet?.holdings.length ? (
              <table>
                <thead><tr><th>Holding</th><th>Symbol</th><th>Classification</th><th>Weight</th><th>Market value</th></tr></thead>
                <tbody>{packet.holdings.slice(0, 10).map((holding) => (
                  <tr key={`${holding.identifier ?? holding.symbol ?? holding.name}`}>
                    <td>{holding.name}</td><td>{holding.symbol ?? '—'}</td><td>{holding.classification ?? '—'}</td><td>{percent(holding.weight, true)}</td><td>{money(holding.marketValue)}</td>
                  </tr>
                ))}</tbody>
              </table>
            ) : <p className="research-data-unavailable">The issuer did not return a usable holdings table. Research cannot infer the portfolio.</p>}
          </section>

          <section className="equity-research-visuals" aria-labelledby="etf-price-title">
            <header><div><p className="markets-eyebrow">Market evidence</p><h2 id="etf-price-title">Price setup</h2></div><span>Price and volume are market data, not generated prose.</span></header>
            <div className="equity-research-chart-grid"><article className="equity-research-chart-card equity-research-price-card"><InteractivePriceChart history={stock.history} symbol={stock.symbol} /></article></div>
          </section>

          <section className="etf-research-executive-copy" aria-label="ETF research executive read">
            <div><span>Investment thesis</span><div className="research-executive-copy"><ReactMarkdown remarkPlugins={[remarkGfm]}>{researchMemoMarkdown(research.investmentThesis)}</ReactMarkdown></div></div>
            <div><span>Key debate</span><div className="research-executive-copy"><ReactMarkdown remarkPlugins={[remarkGfm]}>{researchMemoMarkdown(research.keyDebate)}</ReactMarkdown></div></div>
            <div><span>Fastest kill signal</span><div className="research-executive-copy"><ReactMarkdown remarkPlugins={[remarkGfm]}>{researchMemoMarkdown(research.fastestKillSignal)}</ReactMarkdown></div></div>
          </section>

          <section className="etf-research-sections" aria-label="ETF analysis">
            {research.sections.map((section, index) => (
              <article className="research-report-section" id={section.id} key={section.id}>
                <p className="markets-eyebrow research-section-counter">Fund module {String(index + 1).padStart(2, '0')} of 12</p>
                <h3>{section.title}</h3>
                <div className="research-memo-copy"><ReactMarkdown remarkPlugins={[remarkGfm]}>{researchMemoMarkdown(section.content)}</ReactMarkdown></div>
                <div className="research-evidence-copy"><ReactMarkdown remarkPlugins={[remarkGfm]}>{researchEvidenceMarkdown(section.content)}</ReactMarkdown></div>
                <footer>{sourceFor(packet, section.sourceIds).map((source) => <a key={source.id} href={source.url} target="_blank" rel="noreferrer">{source.label} ↗</a>)}</footer>
              </article>
            ))}
          </section>
        </>
      )}
    </article>
  )
}

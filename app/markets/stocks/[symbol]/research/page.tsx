import Link from 'next/link'
import { notFound } from 'next/navigation'
import ReactMarkdown from 'react-markdown'
import { ResearchActionButton } from '@/components/markets/ResearchActionButton'
import { requireAllowedMarketUser } from '@/lib/auth/markets-session'
import { fetchLatestEquityResearch } from '@/lib/server/company-research'
import { fetchStockViewerData } from '@/lib/server/markets-repository'

export default async function EquityResearchPage({ params }: { params: Promise<{ symbol: string }> }) {
  const { symbol: rawSymbol } = await params
  const symbol = rawSymbol.toUpperCase()
  const user = await requireAllowedMarketUser()
  const [stock, research] = await Promise.all([
    fetchStockViewerData(symbol, user.id),
    fetchLatestEquityResearch(user.id, symbol),
  ])
  if (!stock) notFound()

  return (
    <article className="equity-research-note">
      <header className="equity-research-header">
        <div>
          <p className="markets-eyebrow">Versioned equity research · 1–2 year ownership lens</p>
          <h1 className="markets-display">{stock.company}</h1>
          <p>{symbol} · {stock.sector} · Data as of {new Date(research?.dataAsOf ?? stock.dataAsOf).toLocaleDateString()}</p>
        </div>
        <Link href={`/markets/stocks/${symbol}`}>← Stock Viewer</Link>
      </header>
      {!research || research.status !== 'complete' ? (
        <section className="equity-research-empty">
          <p className="markets-eyebrow">{research?.status === 'failed' ? 'Last generation failed' : research ? 'Background job in progress' : 'No report yet'}</p>
          <h2>{research ? `Research version ${research.version} is ${research.status}.` : 'Promote this name to full research when it deserves deeper work.'}</h2>
          {research?.error ? <p>{research.error}</p> : null}
          <ResearchActionButton symbol={symbol} hasResearch={Boolean(research)} />
        </section>
      ) : (
        <>
          <section className="equity-research-executive-strip">
            <div><span>Formal rating</span><strong>{research.formalRating}</strong></div>
            <div><span>Entry decision</span><strong>{research.entryAction.replaceAll('_', ' ')}</strong></div>
            <div><span>Fair value</span><strong>{research.fairValue ?? '—'}</strong></div>
            <div><span>Confidence</span><strong>{research.confidence}%</strong></div>
          </section>
          <section className="equity-research-debate-grid">
            <div><span>Key Debate</span><p>{research.keyDebate}</p></div>
            <div><span>Mispricing</span><p>{research.mispricing}</p></div>
            <div><span>Fastest Kill Signal</span><p>{research.fastestKillSignal}</p></div>
          </section>
          <div className="equity-research-body">
            <nav aria-label="Research sections">
              {research.sections.map((section, index) => <a key={section.id} href={`#${section.id}`}>{index + 1}. {section.title}</a>)}
            </nav>
            <div className="equity-research-sections">
              {research.sections.map((section, index) => (
                <section key={section.id} id={section.id}>
                  <p className="markets-eyebrow">Section {index + 1} of 15</p>
                  <h2>{section.title}</h2>
                  <ReactMarkdown>{section.content}</ReactMarkdown>
                  {section.sourceIds.length > 0 ? <small>Sources: {section.sourceIds.join(', ')}</small> : null}
                </section>
              ))}
            </div>
          </div>
          <footer className="equity-research-footer">
            <span>Version {research.version} · {research.provider}/{research.model}</span>
            <ResearchActionButton symbol={symbol} hasResearch />
          </footer>
        </>
      )}
    </article>
  )
}

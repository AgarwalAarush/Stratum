import Link from 'next/link'
import { requireAllowedMarketUser } from '@/lib/auth/markets-session'
import { fetchBiotechWorkspace, type BiotechCatalystView } from '@/lib/server/biotech-catalysts'

export const dynamic = 'force-dynamic'

function formatTime(value: string | null): string {
  if (!value) return 'Awaiting data'
  return new Intl.DateTimeFormat('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short', timeZone: 'America/New_York',
  }).format(new Date(value))
}

function formatMove(value: number): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`
}

function catalystLabel(catalyst: BiotechCatalystView): string {
  return catalyst.kind.replaceAll('_', ' ')
}

export default async function MarketsBiotechPage() {
  await requireAllowedMarketUser()
  const workspace = await fetchBiotechWorkspace()
  const lead = workspace.catalysts.find((catalyst) => catalyst.significance === 'urgent') ?? workspace.catalysts[0] ?? null

  return (
    <main className="biotech-page">
      <header className="biotech-hero">
        <div>
          <p className="markets-eyebrow">Clinical evidence → commercial probability → company research</p>
          <h1 className="markets-display">Biotech intelligence</h1>
          <p>Track trial readouts, regulatory decisions, safety signals, and medical meetings without mistaking a headline or a price move for an investment conclusion.</p>
        </div>
        <div className="biotech-asof">
          <span>Data as of</span>
          <strong>{formatTime(workspace.dataAsOf)}</strong>
        </div>
      </header>

      <section className="biotech-metrics" aria-label="Biotech intelligence status">
        <div><strong>{workspace.urgentCount}</strong><span>urgent catalysts</span></div>
        <div><strong>{workspace.investigationCount}</strong><span>need investigation</span></div>
        <div><strong>{workspace.sourceFamilyCount}</strong><span>source families</span></div>
        <div><strong>{workspace.movers.length}</strong><span>material market moves</span></div>
      </section>

      {workspace.timeAnomalyCount > 0 ? <aside className="biotech-warning">
        <strong>Source timing needs review.</strong>
        <span>{workspace.timeAnomalyCount} source {workspace.timeAnomalyCount === 1 ? 'record reports' : 'records report'} publication after ingestion. These records remain visible, but latency claims exclude them.</span>
      </aside> : null}

      {lead ? <section className="biotech-lead" aria-labelledby="biotech-lead-heading">
        <div className="biotech-lead-context">
          <span>{lead.significance}</span>
          <span>{catalystLabel(lead)}</span>
          <span>{lead.phase ?? 'Phase not resolved'}</span>
        </div>
        <h2 id="biotech-lead-heading">{lead.title}</h2>
        <p>{lead.summary}</p>
        <dl>
          <div><dt>What changed</dt><dd>{lead.outcome === 'unknown' ? 'A material clinical or regulatory disclosure requires review.' : `${lead.outcome[0].toUpperCase()}${lead.outcome.slice(1)} ${catalystLabel(lead)}.`}</dd></div>
          <div><dt>Economic question</dt><dd>How much does this change approval, eligible patients, adoption, partner economics, manufacturing requirements, and the expectations already embedded in price?</dd></div>
          <div><dt>World lineage</dt><dd>{lead.eventClusterIds.length ? `${lead.eventClusterIds.length} linked event ${lead.eventClusterIds.length === 1 ? 'cluster' : 'clusters'}` : 'Awaiting a linked World event'}</dd></div>
        </dl>
        <footer>
          {lead.symbols.map((symbol) => <Link key={symbol} href={`/markets/stocks/${encodeURIComponent(symbol)}`}>{symbol} dossier →</Link>)}
          {lead.sources[0] ? <a href={lead.sources[0].url} target="_blank" rel="noreferrer">Primary evidence ↗</a> : null}
        </footer>
      </section> : <section className="biotech-empty">
        <h2>No normalized clinical catalysts yet</h2>
        <p>The new sensor is active, but it has not persisted a qualifying trial, regulatory, safety, or medical-meeting event.</p>
      </section>}

      <div className="biotech-grid">
        <section className="biotech-stream" aria-labelledby="biotech-stream-heading">
          <header>
            <div><p className="markets-eyebrow">Evidence ledger</p><h2 id="biotech-stream-heading">Clinical catalyst stream</h2></div>
            <span>{workspace.catalysts.length} retained</span>
          </header>
          {workspace.catalysts.length ? <div className="biotech-catalyst-list">
            {workspace.catalysts.map((catalyst) => (
              <article key={catalyst.fingerprint} className="biotech-catalyst-row">
                <div className="biotech-catalyst-marker" data-significance={catalyst.significance} aria-hidden="true" />
                <div>
                  <div className="biotech-catalyst-meta">
                    <span>{catalyst.significance}</span><span>{catalystLabel(catalyst)}</span><span>{catalyst.phase ?? 'phase unresolved'}</span>
                    <time dateTime={catalyst.publishedAt ?? catalyst.fetchedAt}>{formatTime(catalyst.publishedAt ?? catalyst.fetchedAt)}</time>
                  </div>
                  <h3>{catalyst.title}</h3>
                  <p>{catalyst.summary}</p>
                  <div className="biotech-catalyst-links">
                    {catalyst.symbols.map((symbol) => <Link key={symbol} href={`/markets/stocks/${encodeURIComponent(symbol)}`}>{symbol}</Link>)}
                    {catalyst.trialId ? <span>{catalyst.trialId}</span> : null}
                    <span>{catalyst.materiality}/100 materiality</span>
                  </div>
                  <details>
                    <summary>{catalyst.sources.length} source {catalyst.sources.length === 1 ? 'record' : 'records'}</summary>
                    <ul>{catalyst.sources.map((source) => <li key={source.sourceId}><a href={source.url} target="_blank" rel="noreferrer">{source.publisher}</a><span>{source.sourceLane.replaceAll('_', ' ')}</span>{source.sourceTimeAnomaly ? <em>time anomaly</em> : null}</li>)}</ul>
                  </details>
                </div>
              </article>
            ))}
          </div> : <p className="biotech-inline-empty">No qualifying events are available.</p>}
        </section>

        <aside className="biotech-movers" aria-labelledby="biotech-movers-heading">
          <header><p className="markets-eyebrow">Tape → investigation</p><h2 id="biotech-movers-heading">Material movers</h2></header>
          {workspace.movers.length ? <div>
            {workspace.movers.map((mover) => (
              <article key={mover.symbol}>
                <header><Link href={`/markets/stocks/${encodeURIComponent(mover.symbol)}`}>{mover.symbol}</Link><strong data-direction={mover.dailyChange >= 0 ? 'up' : 'down'}>{formatMove(mover.dailyChange)}</strong></header>
                <p>{mover.company}</p>
                <dl><div><dt>Price</dt><dd>${mover.price.toFixed(2)}</dd></div><div><dt>Gap</dt><dd>{formatMove(mover.gap)}</dd></div><div><dt>Linked catalysts</dt><dd>{mover.linkedCatalystCount}</dd></div></dl>
                <footer>{mover.candidateId ? <Link href={`/markets/stocks/${encodeURIComponent(mover.symbol)}`}>Candidate brief · {mover.candidateStatus}</Link> : <span>Candidate investigation queued on qualifying move</span>}</footer>
              </article>
            ))}
          </div> : <p className="biotech-inline-empty">No health-care names exceed the current 5% display threshold.</p>}
          <section className="biotech-boundary">
            <h3>Decision boundary</h3>
            <p>A trial result can open an investigation. It cannot accept a company thesis, allocate capital, or place an order.</p>
            <Link href="/markets/candidates">Open Candidate Scout →</Link>
          </section>
        </aside>
      </div>
    </main>
  )
}

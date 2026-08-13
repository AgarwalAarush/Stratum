import { MarketsFeedPage } from '@/components/markets/MarketsFeedPage'
import { MarketsIntentLink } from '@/components/markets/MarketsIntentLink'
import { ResearchQueue } from '@/components/markets/ResearchQueue'
import { requireAllowedMarketUser } from '@/lib/auth/markets-session'
import { fetchFinanceReports } from '@/lib/data/finance-reports'
import { fetchPersistedFmpMarketItems } from '@/lib/data/fmp-intelligence'
import { formatMarketDate } from '@/lib/markets/format-date'
import { mergeMarketNews } from '@/lib/markets/news'
import { formatEntryAction } from '@/lib/markets/research-presentation'
import { fetchEquityResearchLibrary } from '@/lib/server/company-research'
import { fetchEtfResearchLibrary } from '@/lib/server/etf-research'
import { fetchPortfolioResearchCoverage } from '@/lib/server/portfolio-research-seeding'
import { fetchResearchJobs } from '@/lib/server/research-jobs'

export default async function MarketsResearchPage() {
  const userPromise = requireAllowedMarketUser()
  const [equityNotes, etfNotes, jobs, reports, filings, coverage] = await Promise.all([
    userPromise.then((user) => fetchEquityResearchLibrary(user.id)),
    userPromise.then((user) => fetchEtfResearchLibrary(user.id)),
    userPromise.then((user) => fetchResearchJobs(user.id)),
    fetchFinanceReports(30).catch(() => []),
    fetchPersistedFmpMarketItems(['fmp-sec-filings'], 30).catch(() => []),
    userPromise.then((user) => fetchPortfolioResearchCoverage(user.id)).catch(() => null),
  ])
  const notes = [...equityNotes, ...etfNotes].sort((left, right) => right.generatedAt.localeCompare(left.generatedAt))
  const items = mergeMarketNews([filings, reports], 40)
  return (
    <div className="markets-research-library">
      <header className="market-explore-heading">
        <div><p className="markets-eyebrow">Immutable research versions</p><h1 className="markets-display">Research</h1></div>
        <span>{notes.length} generated artifacts</span>
      </header>
      <ResearchQueue initialJobs={jobs} />
      {coverage && coverage.ownedSymbols.length > 0 ? <section className="research-artifact-grid" aria-labelledby="portfolio-research-title">
        <div className="markets-intent-link">
          <div><strong id="portfolio-research-title">Portfolio-first coverage</strong><span>{coverage.ownedSymbols.filter((symbol) => coverage.coveredSymbols.includes(symbol)).length}/{coverage.ownedSymbols.length} owned researched</span></div>
          <h2>{coverage.targets.length ? `Next: ${coverage.targets.map((target) => target.symbol).join(' · ')}` : 'Owned names are covered or already in the research queue.'}</h2>
          <footer><span>Owned first</span><span>Watchlists second</span><span>Peers are research leads, not recommendations</span></footer>
        </div>
      </section> : null}
      <section className="research-artifact-grid">
        {notes.length === 0 ? <p>No full research artifacts yet. Promote a Candidate Scout brief or generate one from a Stock Viewer.</p> : notes.map((note) => (
          <MarketsIntentLink key={note.id} href={`/markets/stocks/${note.symbol}/research`}>
            <div><strong>{note.symbol}</strong><span>v{note.version}</span></div>
            <h2>{note.keyDebate || `${note.status} research version`}</h2>
            <footer><span>{note.formalRating}</span><span>{formatEntryAction(note.entryAction)}</span><time dateTime={note.generatedAt}>{formatMarketDate(note.generatedAt)}</time></footer>
          </MarketsIntentLink>
        ))}
      </section>
      <MarketsFeedPage
        eyebrow="Supporting evidence"
        title="Filings and institutional context"
        description="Source material that can be promoted into a versioned CompanyPacket and full research note."
        items={items}
        emptyMessage="No current research evidence is inside the verified lookback window."
      />
    </div>
  )
}

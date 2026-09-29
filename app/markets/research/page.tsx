import Link from 'next/link'
import { Suspense } from 'react'
import { MarketsFeedPage } from '@/components/markets/MarketsFeedPage'
import { MarketsIntentLink } from '@/components/markets/MarketsIntentLink'
import { ResearchQueue } from '@/components/markets/ResearchQueue'
import { requireAllowedMarketUser } from '@/lib/auth/markets-session'
import { fetchFinanceReports } from '@/lib/data/finance-reports'
import { fetchPersistedFmpMarketItems } from '@/lib/data/fmp-intelligence'
import { formatMarketDate } from '@/lib/markets/format-date'
import { mergeMarketNews } from '@/lib/markets/news'
import { formatEntryAction } from '@/lib/markets/research-presentation'
import { fetchEquityResearchLibrary, fetchEtfResearchLibrary } from '@/lib/server/research-library'
import { cachedFetchWithFallback } from '@/lib/server/cache'
import { fetchPortfolioResearchCoverage } from '@/lib/server/portfolio-research-seeding'
import { fetchResearchJobs } from '@/lib/server/research-jobs'
import styles from './research.module.css'

export default async function MarketsResearchPage() {
  const user = await requireAllowedMarketUser()
  return <Suspense fallback={<SectionLoading label="Research library" />}><ResearchLibrary ownerId={user.id} /></Suspense>
}

function SectionLoading({ label }: { label: string }) {
  return <p className="py-6 text-sm text-[var(--text-muted)]" role="status">Loading {label.toLowerCase()}…</p>
}

async function ResearchLibrary({ ownerId }: { ownerId: string }) {
  const library = await Promise.all([
    fetchEquityResearchLibrary(ownerId),
    fetchEtfResearchLibrary(ownerId),
  ]).catch(() => null)
  const notes = (library ?? []).flat().sort((left, right) => right.generatedAt.localeCompare(left.generatedAt))
  return (
    <div className="markets-research-library">
      <header className="market-explore-heading">
        <div><p className="markets-eyebrow">Immutable research versions</p><h1 className="markets-display">Research</h1></div>
        <span>{library ? `${notes.length} generated artifacts` : 'Library unavailable'}</span>
      </header>
      <details className="mb-6 text-sm">
        <summary className="cursor-pointer text-[var(--text-muted)]">Research tools</summary>
        <nav aria-label="Research tools" className="mt-3 flex flex-wrap gap-x-6 gap-y-3">
          {[["candidates", "Candidate scout"], ["explore", "Explore"], ["screener", "Screener"], ["theses", "Theses"], ["review", "Review queue"], ["biotech", "Biotech"]].map(([path,label]) => <Link key={path} href={`/markets/${path}`} className="underline underline-offset-4">{label}</Link>)}
        </nav>
      </details>
      <Suspense fallback={<SectionLoading label="Research queue" />}><QueueSection ownerId={ownerId} /></Suspense>
      <Suspense fallback={<SectionLoading label="Portfolio coverage" />}><CoverageSection ownerId={ownerId} /></Suspense>
      <section className={`research-artifact-grid ${styles.artifacts}`}>
        {!library ? <p role="alert">Saved research could not be loaded. Use Refresh to try again.</p> : notes.length === 0 ? <p>No full research artifacts yet. Promote a Candidate Scout brief or generate one from a Stock Viewer.</p> : notes.map((note) => (
          <MarketsIntentLink key={note.id} href={`/markets/stocks/${note.symbol}/research`}>
            <div><strong>{note.symbol}</strong><span>v{note.version}</span></div>
            <h2>{note.keyDebate || `${note.status} research version`}</h2>
            <footer><span>{note.formalRating}</span><span>{formatEntryAction(note.entryAction)}</span><time dateTime={note.generatedAt}>{formatMarketDate(note.generatedAt)}</time></footer>
          </MarketsIntentLink>
        ))}
      </section>
      <Suspense fallback={<SectionLoading label="Supporting evidence" />}><SupportingEvidence /></Suspense>
    </div>
  )
}

async function QueueSection({ ownerId }: { ownerId: string }) {
  const jobs = await fetchResearchJobs(ownerId)
  return <ResearchQueue initialJobs={jobs} />
}

async function CoverageSection({ ownerId }: { ownerId: string }) {
  const coverage = await fetchPortfolioResearchCoverage(ownerId).catch(() => null)
  if (!coverage) return <p className="py-4 text-sm text-[var(--text-muted)]">Portfolio coverage is temporarily unavailable. Refresh to retry.</p>
  if (!coverage.ownedSymbols.length) return null
  return <section className={styles.coverage} aria-labelledby="portfolio-research-title">
    <div>
      <h2 id="portfolio-research-title">Portfolio-first coverage</h2>
      <p>Owned first · Watchlists second · Peers are research leads, not recommendations</p>
    </div>
    <div>
      <strong>{coverage.ownedSymbols.filter((symbol) => coverage.coveredSymbols.includes(symbol)).length}/{coverage.ownedSymbols.length} owned researched</strong>
      <p>{coverage.targets.length ? `Next: ${coverage.targets.map((target) => target.symbol).join(' · ')}` : 'Owned names are covered or already in the research queue.'}</p>
    </div>
  </section>
}

async function SupportingEvidence() {
  const evidence = await cachedFetchWithFallback({
    key: 'stratum:markets:research:evidence:v1', ttlSeconds: 300,
    fetcher: async () => {
      const [reports, filings] = await Promise.all([
        fetchFinanceReports(30), fetchPersistedFmpMarketItems(['fmp-sec-filings'], 30),
      ])
      return mergeMarketNews([filings, reports], 40)
    },
  }).catch(() => null)
  if (!evidence) return <p className="py-4 text-sm text-[var(--text-muted)]">Supporting evidence is temporarily unavailable. Saved research remains available above.</p>
  return <MarketsFeedPage
        eyebrow="Supporting evidence"
        title="Filings and institutional context"
        description="Source material that can be promoted into a versioned CompanyPacket and full research note."
        items={evidence.data ?? []}
        emptyMessage="No current research evidence is inside the verified lookback window."
      />
}

import Link from 'next/link'
import { Suspense } from 'react'
import { MarketsFeedPage } from '@/components/markets/MarketsFeedPage'
import { ResearchLibraryGrid } from '@/components/markets/ResearchLibraryGrid'
import { ResearchQueue } from '@/components/markets/ResearchQueue'
import { requireAllowedMarketUser } from '@/lib/auth/markets-session'
import { fetchFinanceReports } from '@/lib/data/finance-reports'
import { fetchPersistedFmpMarketItems } from '@/lib/data/fmp-intelligence'
import { mergeMarketNews } from '@/lib/markets/news'
import { fetchEquityResearchLibrary, fetchEtfResearchLibrary } from '@/lib/server/research-library'
import { cachedFetchWithFallback } from '@/lib/server/cache'
import { loadResearchCoverage, researchCoverageResponse } from '@/lib/server/interest-coverage'
import { ResearchCoverage } from '@/components/markets/ResearchCoverage'
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
        <div><p className="markets-eyebrow">Immutable research versions</p><h1 className="markets-display">Research</h1><p className={styles.deck}>The investment questions, evidence and versions behind your decisions.</p></div>
        <span>{library ? `${notes.length} saved reports` : 'Library unavailable'}</span>
      </header>
      <nav aria-label="Research tools" className={styles.tools}>
        <a href="#research-library-title" aria-current="page">Library</a>
        {[["candidates", "Candidate scout"], ["explore", "Explore"], ["screener", "Screener"], ["theses", "Theses"], ["review", "Review queue"], ["biotech", "Biotech"]].map(([path,label]) => <Link key={path} href={`/markets/${path}`}>{label}</Link>)}
      </nav>
      <div className={styles.context}>

        <Suspense fallback={<SectionLoading label="Research queue" />}><QueueSection ownerId={ownerId} /></Suspense>
      </div>
      <Suspense fallback={<SectionLoading label="Research coverage" />}><CoverageSection ownerId={ownerId} /></Suspense>
      {library ? <ResearchLibraryGrid notes={notes} /> : <p className={styles.unavailable} role="alert">Saved research could not be loaded. Use Refresh to try again.</p>}
      <Suspense fallback={<SectionLoading label="Supporting evidence" />}><SupportingEvidence /></Suspense>
    </div>
  )
}

async function QueueSection({ ownerId }: { ownerId: string }) {
  const jobs = await fetchResearchJobs(ownerId)
  return <ResearchQueue initialJobs={jobs} />
}

async function CoverageSection({ ownerId }: { ownerId: string }) {
  const coverage = await loadResearchCoverage(ownerId).then(researchCoverageResponse).catch(()=>null)
  return <ResearchCoverage initial={coverage} />
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

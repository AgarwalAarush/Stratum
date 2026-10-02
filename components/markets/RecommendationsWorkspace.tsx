'use client'
import Link from 'next/link'
import { RecommendationStatus } from './RecommendationStatus'
import { RecommendationRefresh } from './RecommendationRefresh'
import { ManualPortfolioConfirmation } from './ManualPortfolioConfirmation'
import {
  ForecastReview,
  LearningRegistrationForm,
} from './RecommendationLearningControls'
import { useState } from 'react'
import useSWR from 'swr'
import { CaretDown, ArrowLeft, ArrowClockwise } from '@phosphor-icons/react'
import styles from './RecommendationsWorkspace.module.css'
import { useRouter } from 'next/navigation'
import { decisionActionLabel, decisionIsBlocked, isActionableCapitalChange } from '@/lib/markets/recommendation-display'
import type { fetchRecommendationActions, fetchRecommendationEvidence, fetchRecommendationLearning } from '@/lib/server/recommendation-reads'
import { RecommendationMemo } from './RecommendationMemo'
import type {
  Recommendation,
} from '@/lib/markets/recommendations'
type Data = Awaited<ReturnType<typeof fetchRecommendationActions>>
async function fetchView<Data>(url: string): Promise<Data> {
  const response = await fetch(url, { signal: AbortSignal.timeout(15_000) })
  if (!response.ok) throw new Error('This view could not be loaded. Try again.')
  return response.json()
}
const record = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {}
const stamp = (v: unknown) =>
  typeof v === 'string'
    ? new Date(v).toLocaleString('en-US', {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: 'America/Los_Angeles',
      })
    : 'Unavailable'
const actionLabel = (s: string) => s === 'no_trade' ? 'Wait — evidence incomplete' : s.replaceAll('_', ' ')
export function RecommendationsWorkspace({
  initialData,
}: {
  initialData: Data | null
}) {
  const [tab, setTab] = useState<'decisions' | 'learning'>('decisions')
  const [portfolioId, setPortfolioId] = useState('all')
  const [archiveLimit, setArchiveLimit] = useState(12)
  const router = useRouter()
  const { data: learning, error: learningError, mutate: retryLearning } = useSWR<Awaited<ReturnType<typeof fetchRecommendationLearning>>>(
    tab === 'learning' ? `/api/markets/recommendations?view=learning&edition=${initialData?.latest?.id ?? ''}&read=${initialData?.viewedAt ?? ''}` : null,
    fetchView,
    { revalidateOnFocus: false, shouldRetryOnError: false },
  )
  const data = initialData,
    context = data?.context
  const latest = data?.latest
  const currentEdition =
    latest?.decision_date ===
    new Date(data?.viewedAt ?? '1970-01-01').toLocaleDateString('en-CA', {
      timeZone: 'America/Los_Angeles',
    })
  const visible = data?.recommendations.filter(r => portfolioId === 'all' || (r.content as Recommendation).portfolioId === portfolioId) ?? []
  const viewedAt = Date.parse(data?.viewedAt ?? '')
  const actionRows = visible.filter(r => isActionableCapitalChange(r.content as Recommendation, viewedAt))
  const archivedRows = visible.filter(r => !actionRows.includes(r))
  function renderDecision(row: NonNullable<Data>['recommendations'][number]) {
    return <DecisionRow key={row.id} row={row} data={data!} />
  }
  return (
    <div className={styles.page}>
      <Link href="/markets" className={styles.breadcrumb}><ArrowLeft size={14} /> Today <span>/</span> Recommendations</Link>
      <header className={styles.header}>
        <div>
          <h1>
            Recommendations
          </h1>
          <p className={styles.subtitle}>Daily portfolio decisions · 7:00 AM Pacific</p>
        </div>
        <div className={styles.publication}>
          <p>
            {latest
              ? `Published ${stamp(latest.published_at)} PT`
              : 'Awaiting first publication'}
          </p>
          <RecommendationRefresh />
        </div>
      </header>
      <nav
        aria-label="Recommendation views"
        className={styles.tabs}
      >
        {(['decisions', 'learning'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            aria-current={tab === t ? 'page' : undefined}
            className={tab === t ? styles.activeTab : undefined}
          >
            {t === 'decisions' ? 'Actions' : 'Track record'}
          </button>
        ))}
      </nav>
      {data?.preparation && <p role="status" className={styles.sectionNote}>
        Preparing an updated assessment. Source refreshes finish before a new edition is evaluated and published.
      </p>}
      {!latest ? (
        <section className="my-10 max-w-2xl">
          <h2 className="text-xl">
            {data
              ? 'The first daily edition is being prepared.'
              : 'The decision store is unavailable.'}
          </h2>
          <p className="mt-3 text-sm leading-6 text-[var(--text-muted)]">
            {data
              ? 'Approved buys, adds, trims and sells will appear here with their reasoning and evidence.'
              : 'Stratum cannot verify a current investment recommendation. Existing holdings have not been declared safe. Your standing risk controls still apply.'}
          </p>
          {!data && <button className={styles.retry} onClick={() => router.refresh()}><ArrowClockwise size={16} /> Try again</button>}
        </section>
      ) : tab === 'decisions' ? (
        <>
          <RecommendationStatus recommendations={visible.map(r => r.content as Recommendation)} viewedAt={data!.viewedAt} earlierEdition={!currentEdition} />
          <nav aria-label="Portfolio filter" className={styles.filters}>
            {[{id:'all',name:'All portfolios'}, ...(data?.accounts ?? [])].map(account => <button key={account.id} onClick={() => { setPortfolioId(account.id); setArchiveLimit(12) }} aria-pressed={portfolioId === account.id}>{account.name}</button>)}
          </nav>
          {actionRows.length > 0 && <section aria-label="Capital actions">
            <h2 className={styles.sectionTitle}>Ready for review <span>{actionRows.length}</span></h2>
            {actionRows.map(renderDecision)}
          </section>}
          {archivedRows.length > 0 && <section className={styles.archive} aria-label="Assessment archive">
            <h2 className={styles.sectionTitle}>{currentEdition ? 'Other decisions' : 'Previous assessment'} <span>{archivedRows.length} decisions</span></h2>
            <p className={styles.sectionNote}>{currentEdition ? 'Holds, blocked assessments, deferred decisions and expired advice.' : 'Historical decisions · check validity before acting.'}</p>
            <div className={styles.tableHead} aria-hidden="true"><span>Symbol</span><span>Portfolio</span><span>Assessment</span><span>Validity</span><span /></div>
            {archivedRows.slice(0, archiveLimit).map(renderDecision)}
            {archiveLimit < archivedRows.length && <button className={styles.showMore} onClick={() => setArchiveLimit(limit => limit + 12)}>Show more decisions <span>{archiveLimit} of {archivedRows.length}</span><CaretDown size={14} /></button>}
          </section>}
          {!visible.length && <p className={styles.sectionNote}>No decisions for this portfolio in this edition.</p>}
          <details className={styles.disclosure}>
            <summary>Edition details</summary><p>{latest.summary}</p>
            <p>Evidence as of {stamp(context?.cutoff)} PT · {context?.policy} · {data?.recommendations.length} account decisions</p>
          </details>
          {(context?.gaps.length ?? 0) > 0 && <details className={styles.disclosure}><summary>Evidence limits <span>{context!.gaps.length}</span></summary><ul>{context!.gaps.map(gap => <li key={gap}>{gap}</li>)}</ul></details>}
        </>
      ) : learningError ? (
        <div className={styles.feedback} role="alert"><p>Track record could not be loaded. Your assessment is still available.</p><button className={styles.retry} onClick={() => void retryLearning()}>Try again</button></div>
      ) : !learning ? (
        <div className={styles.feedback} role="status" aria-busy="true">Loading track record…</div>
      ) : (
        <section className="py-8">
          <h2 className="text-xl">Did the recommendation work—and why?</h2>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-[var(--text-muted)]">
            5, 10 and 20 trading-session markouts diagnose selection and
            timing. Economic forecasts are assessed separately from price.
            Unfilled entries, missing data and owner overrides remain visible.
          </p>
          {learning.evaluations.length ? (
            <div className="mt-6 space-y-4">
              {learning.evaluations.map((e) => (
                <details
                  key={e.id}
                  className="border border-[var(--border)] p-5"
                >
                  <summary className="cursor-pointer text-sm">
                    {actionLabel(e.kind)} · {e.horizon} ·{' '}
                    {String(record(e.content).status ?? 'Review')} ·{' '}
                    {stamp(e.as_of)}
                  </summary>
                  <p className="mt-3 text-sm">
                    {String(
                      record(e.content).reason ??
                        'Counterfactual evaluation; missing inputs remain unavailable.',
                    )}
                  </p>
                  <OutcomeDetails content={record(e.content)} />
                </details>
              ))}
            </div>
          ) : (
            <p className="mt-8 border-t border-[var(--border)] pt-6 text-sm">
              No matured outcome cohort yet. The first results appear only
              after the required market sessions have elapsed.
            </p>
          )}
          <div className="mt-8">
            <h3 className="font-medium">Forecast review</h3>
            <p className="mt-2 text-sm text-[var(--text-muted)]">Only forecasts that passed review are eligible. Operating outcomes and market returns are assessed separately.</p>
            {learning.forecasts.map((f) => (
              <ForecastReview key={f.id} forecast={f} />
            ))}
          </div>
          <LearningRegistrationForm />
          <section className="mt-6 border border-[var(--border)] p-5 text-sm" aria-label="Shadow calibration">
            <h3 className="font-medium">Prospective shadow comparisons</h3>
            <p className="mt-2 text-[var(--text-muted)]">{learning.shadowRuns.length} captured editions in the latest 100 runs. These alternatives change forecast probabilities only; your published capital actions stay unchanged.</p>
            {learning.shadowEvaluations.length ? learning.shadowEvaluations.slice(0,5).map(e => {
              const result=record(e.content)
              return <div key={e.id} className="mt-4 border-t border-[var(--border)] pt-3">
                <p className="font-medium">{result.comparisonPolicy === 'world-context-ablation-v1' ? 'Company evidence alone versus added World context' : 'Forecast probability calibration'}</p>
                <p>{String(result.resolvedEpisodes ?? 0)} resolved, {String(result.unresolvedEpisodes ?? 0)} unresolved after repeated and overlapping forecasts are removed.</p>
                <p className="mt-1">Baseline Brier: {result.baselineBrier == null ? 'Awaiting outcomes' : Number(result.baselineBrier).toFixed(3)} · Shadow Brier: {result.candidateBrier == null ? 'Awaiting outcomes' : Number(result.candidateBrier).toFixed(3)}</p>
                <p className="mt-1 text-xs text-[var(--text-muted)]">Lower is better. No automatic promotion; uncertainty and repeated experiments require review.</p>
              </div>
            }) : <p className="mt-3">No scored shadow cohort yet. Registration must precede the evidence cutoff; economic forecasts must resolve before scoring.</p>}
          </section>

          <div className="mt-8 border-t border-[var(--border)] pt-6 text-sm">
            <h3 className="font-medium">Controlled learning</h3>
            <p className="mt-2 max-w-3xl leading-6 text-[var(--text-muted)]">
              Confidence is calibrated against resolved forecasts, counting
              repeated daily recommendations as one episode. Process changes
              require a registered comparison, prospective evidence and owner
              review. Old recommendations and probabilities remain unchanged.
            </p>
            {learning.cohorts.map((c) => (
              <p key={c.id} className="mt-3">
                {String(
                  record(record(c.content).calibration).independentEpisodes ??
                    0,
                )}{' '}
                independent episodes ·{' '}
                {String(
                  record(record(c.content).calibration).reason ??
                    'Gathering evidence',
                )}
              </p>
            ))}
          </div>
        </section>
      )}
      <details className="mt-8 border-t border-[var(--border)] pt-5 text-sm">
        <summary className="cursor-pointer text-[var(--text-muted)]">Update portfolio inputs</summary>
        {data?.accounts.filter(a => a.kind === 'manual').map(a => <ManualPortfolioConfirmation key={a.id} account={a} />)}
      </details>
      <footer className="mt-12 border-t border-[var(--border)] pt-5 text-xs text-[var(--text-muted)]">
        Email alerts only for approved capital changes · Stratum does not place orders.
      </footer>
    </div>
  )
}
function DecisionRow({ row, data }: { row: Data['recommendations'][number]; data: Data }) {
  const rec = row.content as Recommendation
  const [expanded, setExpanded] = useState(isActionableCapitalChange(rec, Date.parse(data.viewedAt)))
  const { data: details, error, mutate } = useSWR<Awaited<ReturnType<typeof fetchRecommendationEvidence>>>(
    expanded ? `/api/markets/recommendations?view=evidence&batch=${data.latest!.id}&read=${data.viewedAt}` : null,
    fetchView,
    { revalidateOnFocus: false, shouldRetryOnError: false },
  )
  const expired = !(Date.parse(rec.expiresAt) > Date.parse(data.viewedAt))
  const portfolioName = data.accounts.find(account => account.id === rec.portfolioId)?.name ?? 'Recorded portfolio'
  return <div className={styles.decisionRow}>
    <button className={styles.rowButton} aria-expanded={expanded} aria-controls={`decision-${row.id}`} onClick={() => setExpanded(value => !value)}>
      <span className={styles.symbol}>{rec.symbol}</span>
      <span className={styles.portfolio}>{portfolioName}</span>
      <span className={styles.assessment}>{decisionActionLabel(rec)}</span>
      <span className={styles.validity} data-expired={expired}>{expired ? 'Expired' : decisionIsBlocked(rec) ? 'Needs review' : 'Current'}</span>
      <CaretDown size={15} className={expanded ? styles.rotated : undefined} />
    </button>
    {expanded && <div id={`decision-${row.id}`} className={styles.rowDetails}>
      {!details && !error && <p role="status">Loading sources and responses…</p>}
      {error && <p role="alert">Source details are unavailable. <button className={styles.textButton} onClick={() => void mutate()}>Try again</button></p>}
      <RecommendationMemo id={row.id} rec={rec} portfolioName={portfolioName} viewedAt={data.viewedAt} evidence={details} onSaved={() => void mutate()} />
    </div>}
  </div>
}
function OutcomeDetails({ content }: { content: Record<string, unknown> }) {
  const percent = (value: unknown) =>
    typeof value === 'number' && Number.isFinite(value)
      ? `${(value * 100).toFixed(2)}%`
      : 'Not yet measurable'
  const labels: Record<string, string> = {
    grossReturn: 'Stock return',
    netReturn: 'After modeled costs',
    benchmarkReturn: 'Benchmark return',
    excessReturn: 'Return above benchmark',
    peerRelative: 'Return above fixed peers',
    maximumAdverseExcursion: 'Largest adverse move',
    drawdown: 'Peak-to-trough decline',
    selection: 'Selection contribution',
    timing: 'Timing contribution',
    sizing: 'Sizing contribution',
    riskManagement: 'Risk-management contribution',
    ownerDifference: 'Owner difference',
  }
  const owner = record(content.ownerOutcome)
  return (
    <div className="mt-4 text-xs">
      <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Object.entries(labels)
          .filter(([key]) => key in content)
          .map(([key, label]) => (
            <div key={key}>
              <dt className="text-[var(--text-muted)]">{label}</dt>
              <dd className="mt-1 font-mono">{percent(content[key])}</dd>
            </div>
          ))}
      </dl>
      {content.peerReason ? (
        <p className="mt-4">Peer comparison: {String(content.peerReason)}</p>
      ) : null}
      {content.actualExecution ? (
        <p className="mt-4">{String(content.actualExecution)}</p>
      ) : null}
      {Object.keys(owner).length > 0 ? (
        <>
          <p className="mt-2">
            Owner trade contribution: {percent(owner.portfolioContribution)}
          </p>
          <p className="mt-2 leading-5 text-[var(--text-muted)]">
            {String(owner.method)}
          </p>
        </>
      ) : null}
      {content.method ? (
        <p className="mt-4 leading-5 text-[var(--text-muted)]">
          {String(content.method)}
        </p>
      ) : null}
    </div>
  )
}

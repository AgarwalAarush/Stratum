'use client'
import Link from 'next/link'
import { RecommendationRefresh } from './RecommendationRefresh'
import { ManualPortfolioConfirmation } from './ManualPortfolioConfirmation'
import {
  ForecastReview,
  LearningRegistrationForm,
  ManualExecutionRecord,
} from './RecommendationLearningControls'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { fetchRecommendationWorkspace } from '@/lib/server/recommendations'
import type {
  DecisionContext,
  Recommendation,
} from '@/lib/markets/recommendations'
type Data = Awaited<ReturnType<typeof fetchRecommendationWorkspace>>
const record = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {}
const stamp = (v: unknown) =>
  typeof v === 'string'
    ? new Date(v).toLocaleString('en-US', {
        dateStyle: 'medium',
        timeStyle: 'short',
      })
    : 'Unavailable'
const actionLabel = (s: string) => s === 'no_trade' ? 'Wait — evidence incomplete' : s.replaceAll('_', ' ')
const money = (v: number) => new Intl.NumberFormat('en-US', {style:'currency', currency:'USD', maximumFractionDigits:2}).format(v)
export function RecommendationsWorkspace({
  initialData,
}: {
  initialData: Data | null
}) {
  const [tab, setTab] = useState<'decisions' | 'learning'>('decisions')
  const [portfolioId, setPortfolioId] = useState('all')
  const data = initialData,
    context = record(data?.context).content as DecisionContext | undefined
  const latest = data?.latest
  const currentEdition =
    latest?.decision_date ===
    new Date(data?.viewedAt ?? '1970-01-01').toLocaleDateString('en-CA', {
      timeZone: 'America/Los_Angeles',
    })
  const visible = data?.recommendations.filter(r => portfolioId === 'all' || (r.content as Recommendation).portfolioId === portfolioId) ?? []
  const actionRows = visible.filter(r => ['buy','add','trim','sell'].includes(r.action))
  const heldRows = visible.filter(r => !['buy','add','trim','sell'].includes(r.action) && context?.names.some(n => n.owned && n.symbol === r.symbol && n.portfolioId === (r.content as Recommendation).portfolioId))
  const otherRows = visible.filter(r => !actionRows.includes(r) && !heldRows.includes(r))
  const actionable =
    data?.recommendations.filter((r) =>
      ['buy', 'add', 'trim', 'sell'].includes(r.action),
    ).length ?? 0
  function renderDecision(row: NonNullable<Data>['recommendations'][number]) {
    return <DecisionCard key={row.id} row={row} context={context} viewedAt={data!.viewedAt} events={data!.events.filter(e => e.recommendation_id === row.id)} />
  }
  return (
    <div className="mx-auto max-w-[1200px] px-5 py-7 md:px-10 md:py-10">
      <header className="grid gap-4 border-b border-[var(--border)] pb-5 md:grid-cols-[1fr_auto]">
        <div>
          <p className="mb-3 text-[11px] uppercase tracking-[.18em] text-[var(--text-muted)]">
            Your daily investment brief
          </p>
          <h1 className="text-3xl font-medium tracking-tight md:text-4xl">
            What matters today.
          </h1>

        </div>
        <div className="text-sm md:text-right">
          <p>Daily · 7:00 AM Pacific</p>
          <p className="mt-2 text-xs text-[var(--text-muted)]">
            {latest
              ? stamp(latest.published_at)
              : 'Awaiting first publication'}
          </p>
          <RecommendationRefresh />
        </div>
      </header>
      <nav
        aria-label="Recommendation views"
        className="flex gap-7 border-b border-[var(--border)]"
      >
        {(['decisions', 'learning'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            aria-current={tab === t ? 'page' : undefined}
            className={`py-4 text-sm capitalize ${tab === t ? 'border-b-2 border-current' : 'text-[var(--text-muted)]'}`}
          >
            {t === 'decisions' ? 'Insights' : 'Track record'}
          </button>
        ))}
      </nav>
      {!latest ? (
        <section className="my-10 max-w-2xl">
          <h2 className="text-xl">
            {data
              ? 'The first daily edition is being prepared.'
              : 'The decision store is unavailable.'}
          </h2>
          <p className="mt-3 text-sm leading-6 text-[var(--text-muted)]">
            {data
              ? 'Once published, every owned and watched name will appear here with an action, counter-thesis and evidence trail.'
              : 'Stratum cannot verify a current investment recommendation. Existing holdings have not been declared safe. Your standing risk controls still apply.'}
          </p>
        </section>
      ) : tab === 'decisions' ? (
        <>
          {!currentEdition ? (
            <p
              role="status"
              className="mt-6 border border-[var(--border)] p-5 text-sm"
            >
              This is an earlier recorded edition. A current daily evaluation
              is unavailable; check each recommendation’s expiry before
              acting.
            </p>
          ) : null}
          <section className="py-7">
            <p className="max-w-4xl text-base leading-7 md:text-lg md:leading-8">{latest.summary}</p>
            <details className="mt-4 text-xs text-[var(--text-muted)]">
              <summary className="cursor-pointer">Edition details</summary>
              <p className="mt-2">Evidence as of {stamp(context?.cutoff)} · {context?.policy} · {data?.recommendations.length} account decisions</p>
            </details>
          </section>
          <nav aria-label="Portfolio filter" className="mb-6 flex flex-wrap gap-2">
            {[{id:'all',name:'All portfolios'}, ...(data?.accounts ?? [])].map(a => <button key={a.id} onClick={() => setPortfolioId(a.id)} aria-pressed={portfolioId === a.id} className={`rounded-full border border-[var(--border)] px-4 py-2 text-sm ${portfolioId === a.id ? 'bg-[var(--text)] text-[var(--bg)]' : 'text-[var(--text-muted)]'}`}>{a.name}</button>)}
          </nav>
          {Array.isArray(context?.portfolio) && context.portfolio.filter(p => (portfolioId === 'all' || p.account.id === portfolioId) && p.allocationBudget).map(p => <p key={p.account.id} className="mb-5 text-sm text-[var(--text-muted)]">{p.account.name}: {money(p.allocationBudget.total)} investment budget · {money(p.cashBalance)} available to allocate</p>)}
          {(context?.gaps.length ?? 0) > 0 && (
            <div className="mb-6 border border-[var(--border)] p-5 text-sm">
              <p className="font-medium">Evidence limits</p>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {context!.gaps.map((g) => (
                  <li key={g}>{g}</li>
                ))}
              </ul>
            </div>
          )}
          <section aria-label="Capital actions">
            <h2 className="text-lg font-medium">{actionRows.length ? 'Actions to consider' : 'No portfolio changes proposed'}</h2>
            {!actionRows.length && <p className="mt-2 text-sm text-[var(--text-muted)]">{actionable ? 'No capital changes for this portfolio in this edition.' : 'No buy, add, trim or sell passed this edition’s review. Holds and evidence gaps are listed below.'}</p>}
            {actionRows.map(renderDecision)}
          </section>
          {heldRows.length > 0 && <section aria-label="Your holdings" className="mt-8">
            <h2 className="mb-2 text-lg font-medium">Your holdings <span className="text-sm font-normal text-[var(--text-muted)]">{heldRows.length}</span></h2>
            {heldRows.map(renderDecision)}
          </section>}
          {otherRows.length > 0 && <details className="mt-8 border-t border-[var(--border)] py-5">
            <summary className="cursor-pointer text-sm font-medium">Watchlist & research · {otherRows.length}</summary>
            {otherRows.map(renderDecision)}
          </details>}
        </>
      ) : (
        <section className="py-8">
          <h2 className="text-xl">Did the recommendation work—and why?</h2>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-[var(--text-muted)]">
            5, 10 and 20 trading-session markouts diagnose selection and
            timing. Economic forecasts are assessed separately from price.
            Unfilled entries, missing data and owner overrides remain visible.
          </p>
          {data?.evaluations.length ? (
            <div className="mt-6 space-y-4">
              {data.evaluations.map((e) => (
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
            <h3 className="font-medium">Economic forecasts</h3>
            {data?.forecasts.map((f) => (
              <ForecastReview key={f.id} forecast={f} />
            ))}
          </div>
          <LearningRegistrationForm />
          <section className="mt-6 border border-[var(--border)] p-5 text-sm" aria-label="Shadow calibration">
            <h3 className="font-medium">Prospective shadow comparisons</h3>
            <p className="mt-2 text-[var(--text-muted)]">{data?.shadowRuns.length ?? 0} captured editions in the latest 100 runs. These alternatives change forecast probabilities only; your published capital actions stay unchanged.</p>
            {data?.shadowEvaluations.length ? data.shadowEvaluations.slice(0,5).map(e => {
              const result=record(e.content)
              return <div key={e.id} className="mt-4 border-t border-[var(--border)] pt-3">
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
            {data?.cohorts.map((c) => (
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
        Newsletter delivery:{' '}
        {String(
          record(record(data?.delivery).investment_newsletter_delivery)
            .status ?? 'Not configured or not sent',
        )}{' '}
        · Recommendations never place orders.
      </footer>
    </div>
  )
}
function DecisionCard({
  row,
  context,
  events,
  viewedAt,
}: {
  row: Record<string, unknown>
  context?: DecisionContext
  viewedAt: string
  events: Record<string, unknown>[]
}) {
  const expired =
    Date.parse(String((row.content as Recommendation).expiresAt)) <=
    Date.parse(viewedAt)
  const rec = row.content as Recommendation,
    router = useRouter()
  const [rationale, setRationale] = useState(''),
    [status, setStatus] = useState(''),
    [pending, setPending] = useState(false)
  async function respond(eventType: string) {
    setPending(true)
    setStatus('')
    try {
      const response = await fetch('/api/markets/recommendations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recommendationId: row.id,
          eventType,
          rationale,
          requestId: crypto.randomUUID(),
        }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error)
      setStatus('Response appended to the recommendation.')
      setRationale('')
      router.refresh()
    } catch (e) {
      setStatus(e instanceof Error ? e.message : 'Unable to save')
    } finally {
      setPending(false)
    }
  }
  return (
    <article className="border-b border-[var(--border)] py-6">
      <p className="mb-3 text-xs text-[var(--text-muted)]">
        {context?.names.find(
          (n) => n.portfolioId === rec.portfolioId && n.symbol === rec.symbol,
        )?.portfolioName ?? 'Portfolio recorded in evidence'}{' '}

      </p>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div className="flex items-baseline gap-4">
          <Link
            className="font-mono text-xl"
            href={`/markets/stocks/${rec.symbol}`}
          >
            {rec.symbol}
          </Link>
          <span className="border border-[var(--border)] px-2 py-1 text-[11px] uppercase tracking-wider">
            {actionLabel(rec.action)}
          </span>
        </div>
        <span className="text-xs text-[var(--text-muted)]">
          {rec.horizonDays}-day horizon · {rec.confidence}% confidence
        </span>
      </div>
      {expired ? (
        <p
          role="status"
          className="mt-4 border border-[var(--border)] p-3 text-sm font-medium"
        >
          This recommendation has expired. Obtain a new evaluation before
          acting.
        </p>
      ) : null}
      <p className="mt-4 max-w-4xl text-base leading-7">{rec.reason}</p>
      <details className="mt-4">
        <summary className="cursor-pointer text-sm underline underline-offset-4">Reasoning & next steps</summary>
      <div className="mt-5 grid gap-5 text-sm leading-6 md:grid-cols-2">
        <div>
          <h3 className="text-xs uppercase tracking-wide text-[var(--text-muted)]">
            Thesis
          </h3>
          <p className="mt-2">{rec.thesis}</p>
        </div>
        <div>
          <h3 className="text-xs uppercase tracking-wide text-[var(--text-muted)]">
            Counter-thesis
          </h3>
          <p className="mt-2">{rec.counterThesis}</p>
        </div>
        <div>
          <h3 className="text-xs uppercase tracking-wide text-[var(--text-muted)]">
            Entry / exposure
          </h3>
          <p className="mt-2">{rec.entry.condition}</p>
          {rec.entry.targetWeightPct !== null && (
            <p>Target portfolio weight: {rec.entry.targetWeightPct}%</p>
          )}
        </div>
        <div>
          <h3 className="text-xs uppercase tracking-wide text-[var(--text-muted)]">
            Invalidation / exit
          </h3>
          <p className="mt-2">{rec.invalidation.join(' ')}</p>
          <p>{rec.exit}</p>
        </div>
      </div>
      <details className="mt-5 border-t border-[var(--border)] pt-4">
        <summary className="cursor-pointer text-xs">
          Evidence, confidence and alternatives
        </summary>
        <div className="mt-4 space-y-3 text-sm leading-6">
          <p>{rec.mechanism}</p>
          <p>Expectations: {rec.expectations}</p>
          <p>Alternative: {rec.alternative}</p>
          <p>Narrative confidence: {rec.confidence}% · not calibrated</p>
          <p>Reassess: {rec.reassessWhen}</p>
          <p>Advice expires: {stamp(rec.expiresAt)}</p>
          {Object.entries(rec.dimensions).map(([key, value]) => (
            <p key={key}>
              {(
                {
                  thesisQuality: 'Thesis quality',
                  valuation: 'Valuation',
                  timing: 'Entry timing',
                  portfolioFit: 'Portfolio fit',
                } as Record<string, string>
              )[key] ?? key}
              : {value}
            </p>
          ))}
          {rec.sourceIds.map((id) => {
            const source = context?.evidence.find((e) => e.id === id)
            return (
              <p className="break-words text-xs" key={id}>
                {source?.url ? (
                  <a
                    href={source.url}
                    target="_blank"
                    rel="noreferrer"
                    className="underline"
                  >
                    {id}
                  </a>
                ) : (
                  id
                )}{' '}
                · source as of {stamp(source?.asOf)} · available{' '}
                {stamp(source?.availableAt)}
              </p>
            )
          })}
        </div>
      </details>
      <ManualExecutionRecord recommendationId={String(row.id)} />
      <details className="mt-4 border-t border-[var(--border)] pt-4">
        <summary className="cursor-pointer text-xs">
          Record your response {events.length ? `(${events.length})` : ''}
        </summary>
        <label className="mt-4 block text-xs">
          Your reasoning
          <textarea
            className="mt-2 block min-h-20 w-full border border-[var(--border)] bg-transparent p-3 text-sm"
            value={rationale}
            onChange={(e) => setRationale(e.target.value)}
            placeholder="What did you decide, and why?"
          />
        </label>
        <div className="mt-3 flex flex-wrap gap-2">
          {['acknowledged', 'accepted', 'delayed', 'rejected'].map(
            (event) => (
              <button
                disabled={pending || rationale.trim().length < 3}
                onClick={() => respond(event)}
                key={event}
                className="border border-[var(--border)] px-3 py-2 text-xs capitalize disabled:opacity-40"
              >
                {
                  {
                    acknowledged: 'Reviewed',
                    accepted: 'Accept',
                    delayed: 'Wait',
                    rejected: 'Reject',
                  }[event]
                }
              </button>
            ),
          )}
        </div>
        <p role="status" className="mt-3 text-xs">
          {status}
        </p>
        {events.map((e) => (
          <p className="mt-2 text-xs" key={String(e.id)}>
            {String(e.event_type)} · {String(e.rationale)} ·{' '}
            {stamp(e.recorded_at)}
          </p>
        ))}
      </details>
      </details>
    </article>
  )
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

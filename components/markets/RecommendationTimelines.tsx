'use client'
import { useState } from 'react'
import { AGING_CHECKPOINTS, checkpointDate } from '@/lib/markets/recommendation-aging'
import { decisionActionLabel } from '@/lib/markets/recommendation-display'
import type { fetchRecommendationLearning } from '@/lib/server/recommendation-reads'
type Learning = Awaited<ReturnType<typeof fetchRecommendationLearning>>
const object = (v: unknown): Record<string,unknown> => v && typeof v === 'object' ? v as Record<string,unknown> : {}
const date = (v: unknown) => typeof v === 'string' ? new Date(v).toLocaleDateString('en-US',{timeZone:'America/New_York',dateStyle:'medium'}) : 'Unavailable'
const percent = (v: unknown) => typeof v === 'number' && Number.isFinite(v) ? `${(v*100).toFixed(1)}%` : 'Unavailable'
const labels = {'1w':'1 week','2w':'2 weeks','1m':'1 month','2m':'2 months','3m':'3 months','6m':'6 months','1y':'1 year'}
export function RecommendationTimelines({learning, accounts}: {learning:Learning; accounts:Array<{id:string;name:string}>}) {
  const [security,setSecurity] = useState('all'), [checkpoint,setCheckpoint] = useState('all'), [status,setStatus] = useState('all'), [limit,setLimit] = useState(12)
  const filtered = learning.timelines.filter(t => (security === 'all' || t.symbol === security) && (status === 'all' || t.tasks.some(task => (checkpoint === 'all' || task.horizon === checkpoint) && task.status === status)))
  return <section aria-label="Recommendation timelines" className="mt-6">
    <div className="flex flex-wrap gap-4 text-sm">
      <label>Security <select className="ml-2 border border-[var(--border)] bg-[var(--bg)] p-2" value={security} onChange={e => {setSecurity(e.target.value);setLimit(12)}}><option value="all">All securities</option>{[...new Set(learning.timelines.map(t=>t.symbol))].sort().map(s=><option key={s}>{s}</option>)}</select></label>
      <label>Checkpoint <select className="ml-2 border border-[var(--border)] bg-[var(--bg)] p-2" value={checkpoint} onChange={e=>setCheckpoint(e.target.value)}><option value="all">All checkpoints</option>{AGING_CHECKPOINTS.map(c=><option key={c} value={c}>{labels[c]}</option>)}</select></label>
      <label>Status <select className="ml-2 border border-[var(--border)] bg-[var(--bg)] p-2" value={status} onChange={e=>setStatus(e.target.value)}><option value="all">All statuses</option><option value="pending">Pending</option><option value="needs_data">Needs data</option><option value="complete">Complete</option></select></label>
    </div>
    <p className="my-4 text-xs leading-5 text-[var(--text-muted)]">{learning.timelineCoverage}</p>
    <div className="space-y-4">{filtered.slice(0,limit).map(t => {
      const rec = t.recommendation
      return <article key={t.id} className="border border-[var(--border)] p-4 sm:p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2"><h3 className="font-medium">{t.symbol} · {decisionActionLabel(rec)} <span className="text-sm font-normal text-[var(--text-muted)]">{accounts.find(a=>a.id===t.portfolioId)?.name ?? 'Portfolio'}</span></h3><span className="text-xs text-[var(--text-muted)]">Issued {date(t.issuedAt)}</span></div>
        <p className="mt-2 text-sm leading-6">{rec.reason}</p>
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-7">{AGING_CHECKPOINTS.filter(c=>checkpoint==='all'||checkpoint===c).map(c=>{
          const task=t.tasks.find(task=>task.horizon===c), evaluation=t.evaluations.find(e=>e.kind==='aging'&&e.horizon===c), content=object(evaluation?.content)
          return <details key={c} className="border border-[var(--border)] p-3 text-xs"><summary className="cursor-pointer"><strong className="block font-medium">{labels[c]}</strong><span className="mt-1 block text-[var(--text-muted)]">{date(`${checkpointDate(t.issuedAt,c)}T12:00:00-04:00`)}</span><span className="mt-2 block">{task?.status?.replaceAll('_',' ') ?? 'Not scheduled'}</span></summary>
            {task?.retrospective && <p className="mt-2">Retrospective schedule; excluded from prospective trials.</p>}
            <p className="mt-2">Price: {percent(content.grossReturn)} · Benchmark relative: {percent(content.excessReturn)} · Drawdown: {percent(content.drawdown)}</p>
            <p className="mt-2">{String(content.reason ?? task?.error ?? 'Awaiting a completed session and required evidence.')}</p>
            <p className="mt-2">{String(content.actualExecution ?? 'No reported execution attribution.')}</p>
          </details>
        })}</div>
        <details className="mt-4 text-sm"><summary className="cursor-pointer">Evidence, forecasts and execution</summary><div className="mt-3 space-y-3 leading-6">
          <p>{t.coverage.citedSources} cited references · Evidence cutoff {date(t.coverage.cutoff)} · {rec.gateReasons.length ? `Blocked: ${rec.gateReasons.join('; ')}` : 'Passed the issued review; this is not proof of correctness.'}</p>
          <p>Economic forecasts: {rec.forecasts.length ? rec.forecasts.map((f,i)=>{const e=t.evaluations.find(e=>e.kind==='thesis'&&e.horizon===String(i)); return `${f.proposition}: ${String(!f.resolutionSource ? 'legacy unresolvable; historical assessment retained' : object(e?.content).status ?? 'pending')}`}).join('; ') : 'None issued. Price aging does not establish a causal mechanism.'}</p>
          <p>{['watch','research','no_trade'].includes(rec.action) ? 'Descriptive aging; no trade or invented trade failure.' : 'Exposure performance is hypothetical unless an owner-reported fill is linked. Brokerage changes alone do not establish execution.'}</p>
          {t.ownerEvents.length ? t.ownerEvents.map(e=><p key={e.id}>{String(e.event_type).replaceAll('_',' ')} · {date(e.recorded_at)} · {String(e.rationale ?? 'Optional owner report')} {object(e.details).supersedesEventId ? '(supersedes an earlier report)' : ''}</p>) : <p>No owner response reported. Acknowledgement and execution reporting remain optional.</p>}
          {Array.isArray(t.coverage.editionGaps) && t.coverage.editionGaps.length>0 && <details><summary>Frozen edition coverage gaps</summary><ul className="mt-2 list-disc pl-5">{t.coverage.editionGaps.map((gap:unknown,i:number)=><li key={i}>{String(gap)}</li>)}</ul></details>}
          <p className="text-xs text-[var(--text-muted)]">Immutable version {t.id}. Later advice does not extend this version’s expiry.</p>
        </div></details>
      </article>
    })}</div>
    {!filtered.length && <p className="py-6 text-sm">No issued versions match these filters.</p>}
    {filtered.length>limit && <button onClick={()=>setLimit(limit+12)} className="mt-4 border border-[var(--border)] px-4 py-2 text-sm">Show more issued versions</button>}
  </section>
}

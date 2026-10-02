'use client'
import Link from 'next/link'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { decisionActionLabel, decisionHeadline, decisionIsBlocked, readableDecisionMarkdown } from '@/lib/markets/recommendation-display'
import { sourceLabel } from '@/lib/markets/recommendation-memo'
import { researchMemoMarkdown } from '@/lib/markets/research-presentation'
import type { Recommendation } from '@/lib/markets/recommendations'
import type { fetchRecommendationEvidence } from '@/lib/server/recommendation-reads'
import { RecommendationReview } from './RecommendationReview'
import styles from './RecommendationMemo.module.css'
type Evidence=Awaited<ReturnType<typeof fetchRecommendationEvidence>>
function MemoMarkdown({children,className}:{children:string;className?:string}) {
  return <div className={className}><ReactMarkdown remarkPlugins={[remarkGfm]}>{researchMemoMarkdown(readableDecisionMarkdown(children))}</ReactMarkdown></div>
}
export function RecommendationMemo({id,rec,portfolioName,viewedAt,evidence,onSaved}:{id:string;rec:Recommendation;portfolioName:string;viewedAt:string;evidence?:Evidence;onSaved:()=>void}) {
  const expired=Date.parse(rec.expiresAt)<=Date.parse(viewedAt), blocked=decisionIsBlocked(rec)
  const memo=evidence?.memos.find(m=>m.symbol===rec.symbol&&m.portfolioId===rec.portfolioId)
  const sources=rec.sourceIds.map(id=>({id,source:evidence?.evidence.find(e=>e.id===id)}))
  const world=memo?.world??[]
  const baseCase=memo?.research.find(s=>/base case/i.test(s.title))
  const bullCase=memo?.research.find(s=>/bull case/i.test(s.title))
  const date=(value:string)=>new Date(value).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'America/Los_Angeles'})
  return <article className={styles.memo}>
    <header className={styles.header}><div><Link href={`/markets/stocks/${rec.symbol}`} className={styles.symbol}>{rec.symbol}</Link><span className={styles.badge}>{decisionActionLabel(rec)}</span><p>{portfolioName}</p></div><dl>
      {rec.entry.targetWeightPct!==null&&<div><dt>Proposed exposure</dt><dd>{memo?.currentWeightPct!=null?`${memo.currentWeightPct.toFixed(2)}% → `:''}{rec.entry.targetWeightPct}%</dd></div>}
      <div><dt>Review horizon</dt><dd>{rec.horizonDays} days</dd></div><div><dt>Valid through</dt><dd>{date(rec.expiresAt)}</dd></div></dl></header>
    {(expired||blocked)&&<p className={styles.notice} role="status">{expired?'This advice has expired. Request a fresh assessment before acting.':'This proposal has not passed review. The reasoning below is a draft.'}</p>}
    <div className={styles.layout}><div className={styles.reading}>
      <h2>Our current judgment</h2><MemoMarkdown className={styles.lead}>{rec.thesis}</MemoMarkdown>
      {memo?.companyStory.map(story=><section key={story.id}><h3>{story.title}</h3><MemoMarkdown>{story.content}</MemoMarkdown></section>)}
      <section><h3>The path ahead</h3><MemoMarkdown>{rec.expectations}</MemoMarkdown>{baseCase&&<details className={styles.research}><summary>Full base case from the underlying research</summary><MemoMarkdown>{baseCase.content}</MemoMarkdown></details>}
        {rec.forecasts.length>0?<div className={styles.forecasts}>{rec.forecasts.map((f,i)=><div key={i}><MemoMarkdown>{f.proposition}</MemoMarkdown><p className={styles.small}>{Math.round(f.probability*100)}% estimated probability · resolve by {date(f.deadline)}</p><MemoMarkdown>{`Confirm: ${f.confirmation}`}</MemoMarkdown><MemoMarkdown>{`Reconsider: ${f.invalidation}`}</MemoMarkdown></div>)}</div>:<p className={styles.small}>No measurable probability forecast was recorded for this decision. The recovery conditions below are checkpoints, not scored predictions.</p>}
      </section>
      <section><h3>{rec.action==='research'?'Capital decision remains unresolved':'The capital decision'}</h3><MemoMarkdown>{blocked?decisionHeadline(rec):rec.reason}</MemoMarkdown></section>
      <section><h3>Why this decision</h3><MemoMarkdown>{rec.mechanism}</MemoMarkdown>{memo?.keyDebate&&<><h4>The decisive question</h4><MemoMarkdown>{memo.keyDebate}</MemoMarkdown></>}</section>
      <details className={styles.research}><summary>World context</summary>{world.length?world.map(w=><div key={w.id}><h4>{w.title}</h4><MemoMarkdown>{w.summary||'Open World to explore the broader research.'}</MemoMarkdown><p className={styles.small}>{rec.sourceIds.includes(w.id)?'Cited in this decision':'Available in the frozen context; not cited as a decision premise'}</p></div>):<p>No canonical World model was linked to this decision. The recommendation rests on the company research and portfolio evidence shown here.</p>}
        <p className={styles.small}>World research explores possible futures. Its shadow hypotheses do not authorize capital changes.</p><Link href="/markets/world">Explore World research</Link>
      </details>
      <div className={styles.twoColumns}><section><h3>The strongest opposing case</h3>{bullCase&&['sell','trim'].includes(rec.action)?<MemoMarkdown>{bullCase.content}</MemoMarkdown>:<MemoMarkdown>{rec.counterThesis}</MemoMarkdown>}</section><section><h3>What would change the decision</h3><ul>{rec.invalidation.map(v=><li key={v}><MemoMarkdown>{v}</MemoMarkdown></li>)}</ul><MemoMarkdown>{rec.reassessWhen}</MemoMarkdown></section></div>
      <section><h3>Portfolio and alternatives</h3><MemoMarkdown>{rec.dimensions.portfolioFit}</MemoMarkdown><MemoMarkdown>{rec.alternative}</MemoMarkdown><dl className={styles.dimensions}>{[['Valuation',rec.dimensions.valuation],['Timing',rec.dimensions.timing],['Implementation',rec.entry.condition],['Exit / reassessment',rec.exit]].map(([k,v])=><div key={k}><dt>{k}</dt><dd><MemoMarkdown>{v}</MemoMarkdown></dd></div>)}</dl></section>
      <section><h3>Risks and uncertainty</h3><ul>{rec.risks.map(v=><li key={v}><MemoMarkdown>{v}</MemoMarkdown></li>)}</ul><p className={styles.small}>Analyst confidence {rec.confidence}%. This is a subjective assessment, not the probability of profit.</p></section>
      <details className={styles.research}><summary>Read the underlying research</summary>{memo?.research.length?memo.research.map(s=><section key={s.title}><h3>{s.title}</h3><MemoMarkdown>{s.content}</MemoMarkdown></section>):<p>{evidence?'No research excerpt is available in this frozen edition.':'Loading the frozen research…'}</p>}{memo?.researchId&&<Link href={`/markets/research/${memo.researchId}`}>Open complete research</Link>}</details>
      <details className={styles.sources}><summary>Sources and freshness ({sources.length})</summary>{sources.map(({id,source})=><div key={id}>{id.startsWith('research:')?<Link href={`/markets/research/${id.slice(9)}`}>{sourceLabel(id)}</Link>:source?.url&&/^https?:\/\//.test(source.url)?<a href={source.url} target="_blank" rel="noreferrer">{sourceLabel(id)}</a>:<span>{sourceLabel(id)}</span>}<span>{source?.asOf?date(source.asOf):'Source date unavailable'}</span></div>)}</details>
    </div>{evidence?<RecommendationReview key={id} recommendationId={id} symbol={rec.symbol} disabled={expired||blocked} events={evidence?.events.filter(e=>e.recommendation_id===id)??[]} onSaved={onSaved}/>:<aside className={styles.review} role="status">Loading decision history…</aside>}</div>
  </article>
}

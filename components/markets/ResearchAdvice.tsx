import type { ResearchAdvice as Advice } from '@/lib/markets/research-advice'
import type { EvidenceAssessment } from '@/lib/markets/research-contract'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { researchMemoMarkdown } from '@/lib/markets/research-presentation'
import styles from './ResearchAdvice.module.css'
export function ResearchAdvice({advice,evidenceAssessment,status}: {advice?: Advice | null;evidenceAssessment?: EvidenceAssessment | null;status?: string}) {
  const labels = {existingPositionStance:'Existing position',newEntryStance:'New capital',businessView:'Business view',evidenceSufficiency:'Evidence sufficiency'} as const
  const values: Record<string,string> = {undetermined:'Unresolved',retain:'Retain',reduce:'Reduce',exit:'Exit',eligible:'Eligible for consideration',wait:'Wait',avoid:'Avoid',constructive:'Constructive',mixed:'Mixed',adverse:'Adverse',sufficient:'Sufficient',limited:'Limited',insufficient:'Insufficient'}
  const availability = {not_disclosed:'Not publicly disclosed',retrieval_failed:'Source retrieval failed',not_investigated:'Investigation pending'}
  return <section className="equity-research-revision" aria-label="Separate research stances">
    {status&&<p>Report: {status}</p>}
    {advice?<div className="equity-research-revision-grid">{Object.entries(labels).map(([key,label]) => {
    const dimension = advice[key as keyof typeof labels]
    return <article key={key}><h3>{label}: {values[dimension.value]??dimension.value}</h3><div className={styles.reason}><ReactMarkdown remarkPlugins={[remarkGfm]}>{researchMemoMarkdown(dimension.reason)}</ReactMarkdown></div><p>Checkpoints: {dimension.changeConditions.join('; ')}</p></article>
  })}</div>:<p>Separate ownership and new-capital judgments were not recorded in this report. A full research upgrade is needed.</p>}
    {!!evidenceAssessment?.gaps.length&&<details><summary>Evidence limitations ({evidenceAssessment.gaps.length})</summary>{evidenceAssessment.gaps.map(gap=><article key={gap.id}><h4>{gap.description}</h4><p>{availability[gap.availability]} · Constrains: {gap.affectedActions.length?gap.affectedActions.map(action=>({buy:'Buy',add:'Add',hold:'Hold',trim:'Trim',sell:'Sell'})[action]).join(', '):'No proposed action'}</p><ReactMarkdown remarkPlugins={[remarkGfm]}>{researchMemoMarkdown(gap.resolution)}</ReactMarkdown></article>)}</details>}
  </section>
}

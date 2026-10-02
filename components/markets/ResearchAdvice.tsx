import type { ResearchAdvice as Advice } from '@/lib/markets/research-advice'
export function ResearchAdvice({advice}: {advice?: Advice | null}) {
  if (!advice) return <p className="equity-research-revision">Legacy report: separate business, evidence, entry and existing-position stances were not recorded.</p>
  const labels = {businessView:'Business view', evidenceSufficiency:'Evidence sufficiency', newEntryStance:'New entry', existingPositionStance:'Existing position'} as const
  return <section className="equity-research-revision" aria-label="Separate research stances"><div className="equity-research-revision-grid">{Object.entries(labels).map(([key,label]) => {
    const dimension = advice[key as keyof typeof labels]
    return <article key={key}><h3>{label}: {dimension.value}</h3><p>{dimension.reason}</p><small>Sources: {dimension.sourceIds.join(', ')}. Reassess: {dimension.changeConditions.join('; ')}</small></article>
  })}</div></section>
}

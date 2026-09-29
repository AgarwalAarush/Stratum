import Link from 'next/link'
import type { fetchLearningHealth } from '@/lib/server/learning-health'

export function WorldLearningHealth({ health, overdue }: { health: Awaited<ReturnType<typeof fetchLearningHealth>> | null; overdue: Array<{ id: string; title: string }> }) {
  return <section className="world-model-section" aria-label="Learning and evidence health">
    <div className="world-section-heading world-section-heading--major"><div><p className="markets-eyebrow">Learning loop</p><h2>What is improving—and what is blocked</h2></div><Link href="/markets/recommendations">Review decisions →</Link></div>
    {!health ? <p role="status">Learning status could not be verified. Previous analysis remains available.</p> : <>
      <div className="world-status-rail">
        {health.stages.map(stage => <div key={stage.label}><span>{stage.label}</span><strong>{stage.status === 'current' ? 'Up to date' : stage.status === 'stale' ? 'Needs updating' : 'Unavailable'}</strong><small>{stage.at ? new Date(stage.at).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/New_York' }) + ' ET' : 'No successful publication'}</small></div>)}
      </div>
      <div className="world-knowledge-grid">
        <article className="world-node-group"><h3>Evidence review</h3><p>{health.runs.accepted} accepted, {health.runs.rejected} rejected and {health.runs.failed} failed in the latest {health.runs.sampled} World runs.</p><p className="world-empty-copy">{health.queuedJobs} jobs waiting. A running worker alone does not establish fresh analysis.</p></article>
        <article className="world-node-group"><h3>Forecast accuracy</h3><p>{health.learning.resolvedEpisodes} resolved economic episodes · {health.learning.unresolvedEpisodes} unresolved in the latest review.</p><p className="world-empty-copy">{health.learning.resolvedEpisodes < 30 ? 'Too little resolved evidence to claim improved investment judgment.' : 'Descriptive results; independent prospective comparisons still require review.'}</p></article>
        <article className="world-node-group"><h3>Most frequent decision blocker</h3><p>{health.learning.blocker ?? 'No reviewed cohort available.'}</p>{health.learning.blocker ? <p className="world-empty-copy">Affected {health.learning.blockerCount} recommendation versions. Versions are not independent decisions.</p> : null}</article>
      </div>
      {health.outcomes.length ? <div className="world-node-list">{health.outcomes.map((outcome, i) => <article className="world-node-row" key={i}><div><strong>{outcome.confirmed ? 'Confirmed' : 'Disconfirmed'}: {outcome.forecast}</strong><p>{outcome.reason}</p></div></article>)}</div> : <p className="world-empty-copy">No resolved economic claim in the latest outcome sample. Price performance alone does not confirm a thesis.</p>}
    </>}
    {health ? overdue.length ? <div className="world-node-list"><h3>Beliefs due for reconsideration</h3>{overdue.map(node => <Link className="world-node-row" key={node.id} href={`/markets/world/${encodeURIComponent(node.id)}`}><strong>{node.title}</strong><span>Review overdue →</span></Link>)}</div> : <p className="world-empty-copy">No overdue hypothesis review in the current model.</p> : null}
  </section>
}

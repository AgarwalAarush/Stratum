import Link from 'next/link'
import { requireAllowedMarketUser } from '@/lib/auth/markets-session'
import { fetchWorldRuns, fetchWorldWorkspace } from '@/lib/server/world-projection'
import { WorldReviewControl, WorldSystemAction } from '@/components/markets/WorldActions'
import { fetchWorldGovernanceSnapshot } from '@/lib/server/world-governance'

function formatTime(value: unknown): string {
  if (typeof value !== 'string') return 'Unavailable'
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return 'Unavailable'
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/New_York' }).format(date)
}

function text(value: unknown): string {
  return typeof value === 'string' && value.trim() ? value : '—'
}

function runError(value: unknown): string {
  const message = text(value)
  if (message === '—') return 'No recorded error'
  const compact = message.replace(/\s+/g, ' ')
  return compact.length > 240 ? `${compact.slice(0, 237)}…` : compact
}

export default async function WorldSystemPage() {
  await requireAllowedMarketUser()
  const [world, runs, governance] = await Promise.all([fetchWorldWorkspace(), fetchWorldRuns(30), fetchWorldGovernanceSnapshot()])
  const replay = world.replay.run
  const attentionTotal = governance.routeVolumes.reduce((sum, item) => sum + item.count, 0)
  const activePolicy = governance.policies.find((policy) => policy.status === 'active')
  const reviewGroups = ['suspected_miss', 'false_positive', 'promoted_change', 'compound_link', 'coverage_problem'] as const
  return (
    <div className="world-system-page">
      <header className="world-system-header">
        <div><p className="markets-eyebrow">World system</p><h1>Attention, memory, and reliability</h1><p>See what entered the funnel, what stayed as a weak signal, what specialists examined, and what reached durable World memory.</p></div>
        <Link href="/markets/world">← Back to World</Link>
      </header>

      <nav className="world-system-nav" aria-label="World system sections">
        <a href="#attention">Attention</a><a href="#signals">Weak signals</a><a href="#review">Weekly review</a><a href="#coverage">Coverage</a><a href="#replay">Replay</a><a href="#runs">Runs</a>
      </nav>

      <section className="world-system-summary" aria-label="World system summary">
        <div><span>Latest run</span><strong>{world.health.lastRunStatus ?? 'None'}</strong><small>{formatTime(world.health.lastRunAt)}</small></div>
        <div><span>Last successful</span><strong>{world.health.lastSuccessfulCommit?.slice(0, 10) ?? 'None'}</strong><small>{formatTime(world.health.lastSuccessfulRunAt)}</small></div>
        <div><span>Work queue</span><strong>{world.health.pendingEvents + world.health.failedEvents} events</strong><small>{world.health.quarantinedEvents} quarantined</small></div>
        <div><span>Oldest pending</span><strong>{formatTime(world.health.oldestPendingAt)}</strong><small>Live and replay work are isolated</small></div>
      </section>

      <section className="world-system-section" id="attention">
        <div className="world-section-heading world-section-heading--major"><div><p className="markets-eyebrow">Attention funnel · 7 days</p><h2>Every routing choice stays explainable</h2></div><span>{text(activePolicy?.version)} active</span></div>
        <div className="world-attention-layout">
          <div className="world-attention-chart">
            {governance.routeVolumes.map((item) => <div className="world-attention-bar" key={item.route}><span>{item.route.replace('_', ' ')}</span><div><i style={{ width: `${Math.max(3, attentionTotal ? item.count / attentionTotal * 100 : 0)}%` }} /></div><strong>{item.count}</strong></div>)}
            {governance.routeVolumes.length === 0 ? <p className="world-empty-copy">Attention decisions will appear after the migrated sensor runs.</p> : null}
          </div>
          <div className="world-lane-grid">
            {governance.laneVolumes.map((item) => <div key={item.lane}><span>{item.lane.replaceAll('_', ' ')}</span><strong>{item.count}</strong></div>)}
          </div>
        </div>
        <div className="world-source-strip"><span>Largest source families</span>{governance.sourceFamilies.slice(0, 8).map((item) => <span key={item.family}><strong>{item.count}</strong> {item.family}</span>)}</div>
      </section>

      <section className="world-system-section" id="signals">
        <div className="world-section-heading world-section-heading--major"><div><p className="markets-eyebrow">Weak-signal memory</p><h2>Stored now, combinable later</h2></div><span>{governance.signals.length} recent</span></div>
        <div className="world-signal-grid">
          {governance.signals.slice(0, 12).map((signal) => <article key={text(signal.id)}>
            <div><span className={`world-signal-state world-signal-state--${text(signal.status)}`}>{text(signal.status)}</span><small>{formatTime(signal.last_observed_at)}</small></div>
            <h3>{text(signal.title)}</h3><p>{text(signal.summary)}</p>
            <footer><span>{Array.isArray(signal.event_cluster_ids) ? signal.event_cluster_ids.length : 0} events</span><span>{Array.isArray(signal.related_signal_ids) ? signal.related_signal_ids.length : 0} links</span><span>Review {formatTime(signal.next_review_at)}</span></footer>
          </article>)}
          {governance.signals.length === 0 ? <p className="world-empty-copy">No weak signals have been projected under the new policy yet.</p> : null}
        </div>
        <div className="world-specialist-strip"><span>Recent specialist work</span>{governance.specialists.slice(0, 8).map((assessment) => <span key={text(assessment.id)}><strong>{text(assessment.lens).replaceAll('_', ' ')}</strong> · {formatTime(assessment.created_at)}</span>)}</div>
      </section>

      <section className="world-system-section" id="review">
        <div className="world-section-heading world-section-heading--major"><div><p className="markets-eyebrow">Weekly review</p><h2>25 decisions for owner curation</h2></div><span>{governance.weeklyReview.filter((item) => item.label).length} labeled</span></div>
        <div className="world-review-groups">
          {reviewGroups.map((category) => <section key={category}>
            <h3>{category.replaceAll('_', ' ')}</h3>
            {governance.weeklyReview.filter((item) => item.category === category).map((item) => <div className="world-review-row" key={`${category}:${item.subjectId}`}>
              <div><strong>{item.title}</strong><p>{item.detail}</p></div>
              <WorldReviewControl category={item.category} subjectType={item.subjectType} subjectId={item.subjectId} currentLabel={item.label} />
            </div>)}
          </section>)}
        </div>
        <div className="world-policy-row"><div><span>Policy experiments</span><strong>{governance.experiments.filter((experiment) => experiment.status === 'shadow').length} shadowing</strong><p>Only bounded numeric controls can change; a full seven-day gate is mandatory.</p></div><div>{governance.experiments.slice(0, 3).map((experiment) => <span key={text(experiment.id)}>{text(experiment.candidate_version)} · {text(experiment.status)}</span>)}</div></div>
      </section>

      <section className="world-system-section" id="coverage">
        <div className="world-section-heading world-section-heading--major"><div><p className="markets-eyebrow">Coverage frontiers</p><h2>Blind spots are explicit</h2></div><span>{world.coverage.filter((frontier) => frontier.status === 'healthy').length} healthy</span></div>
        <div className="world-system-table">
          {world.coverage.map((frontier) => <div className="world-system-table-row" key={frontier.id}>
            <div><span className={`world-coverage-state world-coverage-state--${frontier.status}`}>{frontier.status.replace('_', ' ')}</span><strong>{frontier.label}</strong><p>{frontier.description}</p></div>
            <div><span>Sources</span><strong>{frontier.sourceFamilyCount}</strong></div>
            <div><span>Nodes</span><strong>{frontier.activeNodeIds.length}</strong></div>
            <div><span>Reviewed</span><strong>{formatTime(frontier.lastReviewedAt)}</strong></div>
            <WorldSystemAction action="refresh-frontier" label="Investigate" payload={{ frontierId: frontier.id }} />
          </div>)}
        </div>
      </section>

      <section className="world-system-section" id="replay">
        <div className="world-section-heading world-section-heading--major"><div><p className="markets-eyebrow">Historical replay</p><h2>{replay ? `${replay.weeksCompleted} of ${replay.weeksTotal} weeks complete` : 'Replay has not started'}</h2></div>{!replay || replay.status !== 'completed' ? <WorldSystemAction action="resume-replay" label={replay ? 'Resume replay' : 'Start replay'} /> : <span>Complete</span>}</div>
        {replay?.error ? <p className="world-system-error">{replay.error}</p> : null}
        <div className="world-system-table world-system-table--batches">
          {world.replay.batches.slice(0, 12).map((batch) => <div className="world-system-table-row" key={batch.id}>
            <div><strong>{formatTime(batch.weekStart)} – {formatTime(batch.weekEnd)}</strong><p>{batch.sourceCount} sources · {batch.clusterCount} retained clusters</p></div>
            <div><span>Status</span><strong>{batch.status}</strong></div>
            <div><span>Attempts</span><strong>{batch.attemptCount}</strong></div>
            <div><span>Events</span><strong>{batch.eventCursor} / {batch.eventClusterIds.length}</strong></div>
            {batch.status === 'failed' ? <WorldSystemAction action="retry-replay-batch" label="Retry" payload={{ batchId: batch.id }} /> : <span />}
          </div>)}
          {world.replay.batches.length === 0 ? <p className="world-empty-copy">The first worker continuation will create replay batches.</p> : null}
        </div>
      </section>

      <section className="world-system-section" id="runs">
        <div className="world-section-heading world-section-heading--major"><div><p className="markets-eyebrow">Thinker runs</p><h2>Recent publication attempts</h2></div><span>{runs.length} shown</span></div>
        <div className="world-system-table world-system-table--runs">
          {runs.map((run) => <div className="world-system-table-row" key={text(run.id)}>
            <div><strong>{text(run.trigger)}</strong><p>{runError(run.error)}</p></div>
            <div><span>Status</span><strong>{text(run.status)}</strong></div>
            <div><span>Started</span><strong>{formatTime(run.started_at)}</strong></div>
            <div><span>Commit</span><strong>{text(run.result_commit).slice(0, 10)}</strong></div>
            <span />
          </div>)}
        </div>
      </section>
    </div>
  )
}

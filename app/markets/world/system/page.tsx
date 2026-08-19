import Link from 'next/link'
import { requireAllowedMarketUser } from '@/lib/auth/markets-session'
import { fetchWorldRuns, fetchWorldWorkspace } from '@/lib/server/world-projection'
import { WorldSystemAction } from '@/components/markets/WorldActions'

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
  const [world, runs] = await Promise.all([fetchWorldWorkspace(), fetchWorldRuns(30)])
  const replay = world.replay.run
  return (
    <div className="world-system-page">
      <header className="world-system-header">
        <div><p className="markets-eyebrow">World system</p><h1>Coverage and reliability</h1><p>The operational view behind the readable World model.</p></div>
        <Link href="/markets/world">← Back to World</Link>
      </header>

      <section className="world-system-summary" aria-label="World system summary">
        <div><span>Latest run</span><strong>{world.health.lastRunStatus ?? 'None'}</strong><small>{formatTime(world.health.lastRunAt)}</small></div>
        <div><span>Last successful</span><strong>{world.health.lastSuccessfulCommit?.slice(0, 10) ?? 'None'}</strong><small>{formatTime(world.health.lastSuccessfulRunAt)}</small></div>
        <div><span>Work queue</span><strong>{world.health.pendingEvents + world.health.failedEvents} events</strong><small>{world.health.quarantinedEvents} quarantined</small></div>
        <div><span>Oldest pending</span><strong>{formatTime(world.health.oldestPendingAt)}</strong><small>Live and replay work are isolated</small></div>
      </section>

      <section className="world-system-section">
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

      <section className="world-system-section">
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

      <section className="world-system-section">
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

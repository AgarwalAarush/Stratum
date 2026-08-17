import Link from 'next/link'
import { requireAllowedMarketUser } from '@/lib/auth/markets-session'
import type { WorldNode } from '@/lib/markets/world-thinker-types'
import { fetchWorldWorkspace } from '@/lib/server/world-projection'
import { WorldLeadActions, WorldRefreshAction } from '@/components/markets/WorldActions'

function formatTime(value: string | null): string {
  if (!value) return 'Unavailable'
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/New_York' }).format(new Date(value))
}

function shortCommit(value: string | null): string {
  return value ? value.slice(0, 10) : 'no commit'
}

function NodeList({ title, nodes }: { title: string; nodes: WorldNode[] }) {
  const emptyLabel = title.replace(/^active\s+/i, '').toLowerCase()
  return (
    <section className="world-node-group">
      <div className="world-section-heading"><p className="markets-eyebrow">{title}</p><span>{nodes.length}</span></div>
      {nodes.length === 0 ? <p className="world-empty-copy">No active {emptyLabel} in the projected commit.</p> : (
        <div className="world-node-list">
          {nodes.slice(0, 8).map((node) => (
            <Link href={`/markets/world/${encodeURIComponent(node.id)}`} key={node.id} className="world-node-row">
              <div><strong>{node.title}</strong><p>{node.summary}</p></div>
              <div className="world-node-metrics"><span>{node.importance} impact</span><span>{node.confidence}% confidence</span></div>
            </Link>
          ))}
        </div>
      )}
    </section>
  )
}

function leadValue(lead: Record<string, unknown>, key: string): string {
  return typeof lead[key] === 'string' ? String(lead[key]) : ''
}

function leadScore(lead: Record<string, unknown>, key: string): number {
  return typeof lead[key] === 'number' ? Number(lead[key]) : 0
}

export default async function MarketsWorldPage() {
  await requireAllowedMarketUser()
  const world = await fetchWorldWorkspace()
  const changes = world.latestChanges[0]
  return (
    <div className="world-page">
      <header className="world-hero">
        <div>
          <p className="markets-eyebrow">Persistent world model · source-linked · owner controlled</p>
          <h1 className="markets-display world-title">What changed in the world—and where could value accrue?</h1>
          <p className="world-deck">The Thinker maintains causal state, challenges prior beliefs, and queues company investigations. It cannot accept a thesis, allocate capital, or trade.</p>
        </div>
        <div className="world-hero-control"><WorldRefreshAction /><span data-freshness={world.freshness}>{world.freshness}</span></div>
      </header>

      <section className="world-current-grid" aria-label="Current world assessment">
        <article className="world-current-assessment">
          <div className="world-section-heading"><p className="markets-eyebrow">Current assessment</p><span>As of {formatTime(world.dataAsOf)}</span></div>
          <h2>{world.current?.title ?? 'World model awaiting its first shadow projection'}</h2>
          <p>{world.current?.summary ?? 'The repository and worker pipeline are ready, but no validated World Thinker commit has been projected yet.'}</p>
          {world.current?.body ? <div className="world-current-body">{world.current.body}</div> : null}
        </article>
        <aside className="world-health" aria-label="Thinker health">
          <p className="markets-eyebrow">Thinker health</p>
          <dl>
            <div><dt>Projected commit</dt><dd>{shortCommit(world.commit)}</dd></div>
            <div><dt>Branch</dt><dd>{world.branch ?? 'not projected'}</dd></div>
            <div><dt>Last run</dt><dd>{world.health.lastRunStatus ?? 'none'}</dd></div>
            <div><dt>Pending events</dt><dd>{world.health.pendingEvents}</dd></div>
            <div><dt>Failed events</dt><dd>{world.health.failedEvents}</dd></div>
            <div><dt>Projection</dt><dd>{world.canonical ? 'canonical' : 'shadow'}</dd></div>
          </dl>
          {world.health.failure ? <p className="world-health-error" role="alert">{world.health.failure}</p> : null}
        </aside>
      </section>

      <section className="world-delta" aria-label="Material changes">
        <div className="world-section-heading"><p className="markets-eyebrow">Material change since the preceding commit</p><span>{changes ? formatTime(changes.asOf) : 'No journal yet'}</span></div>
        {changes ? <><h2>{changes.title}</h2><p>{changes.summary}</p><div className="world-journal-body">{changes.body}</div></> : <p className="world-empty-copy">The first validated run will establish the change journal.</p>}
      </section>

      <div className="world-knowledge-grid">
        <NodeList title="Active situations" nodes={world.situations} />
        <NodeList title="Structural themes" nodes={world.themes} />
        <NodeList title="Actors" nodes={world.actors} />
      </div>

      <section className="world-scenarios">
        <div className="world-section-heading"><p className="markets-eyebrow">Scenario branches and indicators</p><span>Assessments, not forecasts</span></div>
        {world.scenarios.length === 0 ? <p className="world-empty-copy">No active scenario branches have been projected.</p> : world.scenarios.map((scenario) => (
          <Link href={`/markets/world/${encodeURIComponent(scenario.id)}`} key={scenario.id} className="world-scenario-row">
            <div><strong>{scenario.title}</strong><p>{scenario.summary}</p></div>
            <ul>{scenario.indicators.slice(0, 3).map((indicator) => <li key={indicator.id}>{indicator.label}: {indicator.condition}</li>)}</ul>
          </Link>
        ))}
      </section>

      <section className="world-transmission">
        <div className="world-section-heading"><p className="markets-eyebrow">Causal and economic transmission</p><span>Hypotheses remain falsifiable</span></div>
        {world.hypotheses.length === 0 ? <p className="world-empty-copy">No active cross-domain hypothesis has passed the critic.</p> : world.hypotheses.map((hypothesis) => (
          <Link href={`/markets/world/${encodeURIComponent(hypothesis.id)}`} key={hypothesis.id} className="world-transmission-row">
            <span>{hypothesis.title}</span><p>{hypothesis.summary}</p><small>{hypothesis.relationships.map((relationship) => relationship.description).slice(0, 3).join(' → ')}</small>
          </Link>
        ))}
      </section>

      <section className="world-leads">
        <div className="world-section-heading"><p className="markets-eyebrow">Company investigations</p><span>Research leads, never buy recommendations</span></div>
        {world.leads.length === 0 ? <p className="world-empty-copy">No company lead currently clears the explicit research gates.</p> : (
          <div className="world-lead-list">
            {world.leads.map((lead) => {
              const id = leadValue(lead, 'id')
              const status = leadValue(lead, 'status')
              return (
                <article key={id} className="world-lead-row">
                  <div className="world-lead-symbol"><strong>{leadValue(lead, 'symbol')}</strong><span>{leadValue(lead, 'issuer')}</span></div>
                  <div className="world-lead-case"><p>{leadValue(lead, 'what_changed')}</p><small>{leadValue(lead, 'capture_mechanism')}</small><nav className="world-lead-lineage" aria-label={`${leadValue(lead, 'symbol')} research lineage`}><Link href={`/markets/world/${encodeURIComponent(leadValue(lead, 'originating_node_id'))}`}>World node</Link><span>→</span><Link href={`/markets/research?symbol=${encodeURIComponent(leadValue(lead, 'symbol'))}`}>Company research</Link><span>→</span><Link href={`/markets/theses?symbol=${encodeURIComponent(leadValue(lead, 'symbol'))}`}>Thesis review</Link></nav></div>
                  <dl className="world-lead-scores"><div><dt>Impact</dt><dd>{leadScore(lead, 'materiality')}</dd></div><div><dt>Transmission</dt><dd>{leadScore(lead, 'transmission_confidence')}</dd></div><div><dt>Capture</dt><dd>{leadScore(lead, 'capture_plausibility')}</dd></div><div><dt>Evidence</dt><dd>{leadScore(lead, 'evidence_readiness')}</dd></div></dl>
                  <WorldLeadActions leadId={id} status={status} />
                </article>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}

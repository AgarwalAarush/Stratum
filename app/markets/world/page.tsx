import Link from 'next/link'
import { requireAllowedMarketUser } from '@/lib/auth/markets-session'
import type { WorldNode } from '@/lib/markets/world-thinker-types'
import { fetchWorldWorkspace } from '@/lib/server/world-projection'
import { WorldLeadActions, WorldRefreshAction } from '@/components/markets/WorldActions'
import { WorldMarkdown } from '@/components/markets/WorldMarkdown'

function formatTime(value: string | null): string {
  if (!value) return 'Unavailable'
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/New_York' }).format(new Date(value))
}

function shortCommit(value: string | null): string {
  return value ? value.slice(0, 10) : 'No commit'
}

function countLabel(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`
}

function NodeList({ title, nodes, empty }: { title: string; nodes: WorldNode[]; empty: string }) {
  return (
    <section className="world-node-group">
      <div className="world-group-heading"><h3>{title}</h3><span>{nodes.length}</span></div>
      {nodes.length === 0 ? <p className="world-empty-copy">{empty}</p> : (
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
  const needsAttention = world.health.lastRunStatus === 'failed' || Boolean(world.health.failure)
  const operatingState = needsAttention ? 'Needs attention' : world.freshness === 'current' ? 'Healthy' : world.freshness
  const activeModelCount = world.situations.length + world.themes.length + world.actors.length + world.scenarios.length + world.hypotheses.length

  return (
    <div className="world-page">
      <header className="world-header">
        <div>
          <p className="markets-eyebrow">World intelligence</p>
          <h1 className="markets-display world-title">A living model of what matters.</h1>
          <p className="world-deck">Material change, causal transmission, and company investigations—kept separate from thesis acceptance and capital decisions.</p>
        </div>
        <div className="world-header-actions">
          <WorldRefreshAction />
          <span className={`world-operating-state${needsAttention ? ' world-operating-state--attention' : ''}`} data-freshness={world.freshness}>{operatingState}</span>
        </div>
      </header>

      <section className="world-status-rail" aria-label="World Thinker status">
        <div><span>Mode</span><strong>{world.canonical ? 'Canonical' : 'Shadow evaluation'}</strong><small>{world.branch ?? 'No projected branch'}</small></div>
        <div><span>World state</span><strong>{activeModelCount} active nodes</strong><small>Updated {formatTime(world.dataAsOf)}</small></div>
        <div className={world.health.pendingEvents > 0 ? 'world-status-rail--attention' : undefined}><span>Event queue</span><strong>{countLabel(world.health.pendingEvents, 'event')}</strong><small>{world.health.failedEvents ? countLabel(world.health.failedEvents, 'failed event') : 'Awaiting classification'}</small></div>
        <div><span>Research funnel</span><strong>{countLabel(world.leads.length, 'company lead')}</strong><small>Qualified investigations only</small></div>
      </section>

      {needsAttention ? (
        <section className="world-run-alert" role="alert">
          <div><p className="markets-eyebrow">Run health</p><strong>The latest run failed validation; the prior validated world state remains published.</strong></div>
          <details><summary>Technical detail</summary><p>{world.health.failure ?? 'The latest World Thinker run did not complete.'}</p></details>
        </section>
      ) : null}

      <section className="world-priority-grid" aria-label="Latest world intelligence">
        <article className="world-delta" id="latest-change">
          <div className="world-section-heading"><p className="markets-eyebrow">Since the last update</p><span>{changes ? formatTime(changes.asOf) : 'No journal yet'}</span></div>
          {changes ? (
            <>
              <h2>{changes.title}</h2>
              <p>{changes.summary}</p>
              <details className="world-journal-details">
                <summary>Read the full change journal</summary>
                <WorldMarkdown className="world-journal-body">{changes.body}</WorldMarkdown>
              </details>
            </>
          ) : <p className="world-empty-copy">The first validated run will establish the change journal.</p>}
        </article>

        <aside className="world-current-assessment" aria-label="Current world assessment">
          <div className="world-section-heading"><p className="markets-eyebrow">Current stance</p><span>{shortCommit(world.commit)}</span></div>
          <h2>{world.current?.title ?? 'Awaiting the first projection'}</h2>
          <p>{world.current?.summary ?? 'The repository is ready, but no validated World Thinker commit has been projected.'}</p>
          {world.current?.body ? <WorldMarkdown className="world-current-body">{world.current.body}</WorldMarkdown> : null}
          <dl className="world-current-meta">
            <div><dt>Last run</dt><dd>{world.health.lastRunStatus ?? 'None'}</dd></div>
            <div><dt>Run started</dt><dd>{formatTime(world.health.lastRunAt)}</dd></div>
            <div><dt>Projection</dt><dd>{world.canonical ? 'Canonical' : 'Shadow'}</dd></div>
          </dl>
        </aside>
      </section>

      <section className="world-model-section" id="active-model">
        <div className="world-section-heading world-section-heading--major">
          <div><p className="markets-eyebrow">Active model</p><h2>What the Thinker is tracking</h2></div>
          <span>{world.situations.length} situations · {world.themes.length} themes · {world.actors.length} actors</span>
        </div>
        <div className="world-knowledge-grid">
          <NodeList title="Situations" nodes={world.situations} empty="No active situations have been established." />
          <NodeList title="Structural themes" nodes={world.themes} empty="No structural themes have been established." />
          <NodeList title="Actors" nodes={world.actors} empty="No actor currently warrants a durable active node." />
        </div>
      </section>

      <section className="world-forward-grid" aria-label="Scenarios and economic transmission">
        <div className="world-scenarios">
          <div className="world-section-heading"><div><p className="markets-eyebrow">Scenario branches</p><h2>What could change next</h2></div><span>Assessments, not forecasts</span></div>
          {world.scenarios.length === 0 ? <p className="world-empty-copy">No active scenario branches have been projected.</p> : world.scenarios.map((scenario) => (
            <Link href={`/markets/world/${encodeURIComponent(scenario.id)}`} key={scenario.id} className="world-scenario-row">
              <div><strong>{scenario.title}</strong><p>{scenario.summary}</p></div>
              {scenario.indicators.length ? <ul>{scenario.indicators.slice(0, 3).map((indicator) => <li key={indicator.id}>{indicator.label}: {indicator.condition}</li>)}</ul> : <small>No monitored indicators yet.</small>}
            </Link>
          ))}
        </div>

        <div className="world-transmission">
          <div className="world-section-heading"><div><p className="markets-eyebrow">Economic transmission</p><h2>Where value may accrue</h2></div><span>Falsifiable hypotheses</span></div>
          {world.hypotheses.length === 0 ? <p className="world-empty-copy">No active cross-domain hypothesis has passed the critic.</p> : world.hypotheses.map((hypothesis) => (
            <Link href={`/markets/world/${encodeURIComponent(hypothesis.id)}`} key={hypothesis.id} className="world-transmission-row">
              <strong>{hypothesis.title}</strong><p>{hypothesis.summary}</p><small>{hypothesis.relationships.map((relationship) => relationship.description).slice(0, 3).join(' → ')}</small>
            </Link>
          ))}
        </div>
      </section>

      <section className="world-leads" id="company-investigations">
        <div className="world-section-heading world-section-heading--major"><div><p className="markets-eyebrow">Company investigations</p><h2>Names that clear the research gates</h2></div><span>Research leads, never buy recommendations</span></div>
        {world.leads.length === 0 ? (
          <div className="world-empty-state">
            <div><strong>No company lead currently clears every gate.</strong><p>The Thinker has not yet found a verified security with sufficient materiality, transmission confidence, and a specific capture mechanism.</p></div>
            <Link href="/markets/candidates">Open Candidate Scout →</Link>
          </div>
        ) : (
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

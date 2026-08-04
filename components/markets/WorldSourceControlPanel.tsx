'use client'

import { useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'
import type { MarketDomainPack, WorldSourceControlWorkspaceData } from '@/lib/markets/types'

type SourceStatus = 'approved' | 'probation'

function isUsableSource(status: string): status is SourceStatus {
  return status === 'approved' || status === 'probation'
}

function domainSources(workspace: WorldSourceControlWorkspaceData, domainId: string) {
  return workspace.sources.filter((source) => source.domainIds.includes(domainId))
}

function sourceCoverage(workspace: WorldSourceControlWorkspaceData, domain: MarketDomainPack) {
  const sources = domainSources(workspace, domain.id).filter((source) => isUsableSource(source.status))
  return domain.sourceRequirements.map((requirement) => ({
    ...requirement,
    current: new Set(sources.filter((source) => source.evidenceClasses.includes(requirement.evidenceClass)).map((source) => source.id)).size,
  }))
}

function formatDate(value: string | null): string {
  if (!value) return 'Not generated'
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/New_York' }).format(new Date(value))
}

export function WorldSourceControlPanel({ workspace, unavailableReason }: { workspace: WorldSourceControlWorkspaceData | null; unavailableReason: string | null }) {
  const router = useRouter()
  const [selectedDomainId, setSelectedDomainId] = useState(workspace?.domains[0]?.id ?? '')
  const [reason, setReason] = useState('Review source coverage gaps before expanding this domain.')
  const [pending, setPending] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const selectedDomain = useMemo(() => workspace?.domains.find((domain) => domain.id === selectedDomainId) ?? null, [workspace, selectedDomainId])

  if (!workspace) {
    return (
      <section className="market-source-control" aria-labelledby="source-control-heading">
        <p className="markets-eyebrow">Evidence governance</p>
        <h2 id="source-control-heading">Source control</h2>
        <p>{unavailableReason ?? 'Source-control data is unavailable.'}</p>
      </section>
    )
  }

  const candidates = workspace.sources.filter((source) => source.status === 'candidate')
  const failedRuns = workspace.discoveryRuns.filter((run) => run.status === 'failed')
  const health = workspace.sources.flatMap((source) => source.health ? [source.health] : [])
  const requestScout = async () => {
    if (!selectedDomain || !reason.trim() || pending) return
    setPending(true)
    setNotice(null)
    try {
      const response = await fetch('/api/markets/world-sources', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'scout', domainId: selectedDomain.id, reason: reason.trim() }),
      })
      const payload = await response.json() as { error?: string }
      if (!response.ok) throw new Error(payload.error ?? 'Unable to queue source scout')
      setNotice(`Scout queued for ${selectedDomain.label}. It can only create candidate sources; a reviewed contract is still required before ingestion.`)
      router.refresh()
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Unable to queue source scout')
    } finally {
      setPending(false)
    }
  }

  const requestHealthAudit = async () => {
    if (pending) return
    setPending(true)
    setNotice(null)
    try {
      const response = await fetch('/api/markets/world-sources', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'audit-health' }),
      })
      const payload = await response.json() as { error?: string }
      if (!response.ok) throw new Error(payload.error ?? 'Unable to queue source health audit')
      setNotice('Source health audit queued. It probes approved contracts only and records review telemetry; it does not change source admission.')
      router.refresh()
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Unable to queue source health audit')
    } finally {
      setPending(false)
    }
  }

  return (
    <section className="market-source-control" aria-labelledby="source-control-heading">
      <div className="market-source-control-heading">
        <div>
          <p className="markets-eyebrow">Evidence governance</p>
          <h2 id="source-control-heading">Source control</h2>
          <p>Coverage is counted only from approved or probationary sources with an active contract. Candidate links never enter market evidence.</p>
        </div>
        <dl>
          <div><dt>Governed sources</dt><dd>{workspace.sources.filter((source) => isUsableSource(source.status)).length}</dd></div>
          <div><dt>Latest healthy</dt><dd>{health.filter((check) => check.status === 'healthy').length}/{health.length || '—'}</dd></div>
          <div><dt>Pending review</dt><dd>{candidates.length}</dd></div>
          <div><dt>Failed scouts</dt><dd>{failedRuns.length}</dd></div>
        </dl>
      </div>

      <div className="market-domain-control-grid" role="list" aria-label="Market research domains">
        {workspace.domains.map((domain) => {
          const coverage = sourceCoverage(workspace, domain)
          const complete = coverage.every((item) => item.current >= item.minimumSources)
          const selected = selectedDomainId === domain.id
          return (
            <button key={domain.id} type="button" className="market-domain-control-card" data-selected={selected} onClick={() => setSelectedDomainId(domain.id)} role="listitem">
              <span data-status={domain.status}>{domain.status}</span>
              <strong>{domain.label}</strong>
              <small>{complete ? 'Coverage requirement met' : 'Coverage gap remains'}</small>
              <em>{coverage.filter((item) => item.current >= item.minimumSources).length}/{coverage.length} source classes satisfied</em>
            </button>
          )
        })}
      </div>

      {selectedDomain ? (
        <div className="market-source-control-detail">
          <div>
            <p className="markets-eyebrow">{selectedDomain.status} domain</p>
            <h3>{selectedDomain.label}</h3>
            <p>{selectedDomain.description}</p>
            <dl className="market-source-requirements">
              {sourceCoverage(workspace, selectedDomain).map((requirement) => (
                <div key={requirement.evidenceClass} data-complete={requirement.current >= requirement.minimumSources}>
                  <dt>{requirement.evidenceClass.replaceAll('_', ' ')}</dt>
                  <dd>{requirement.current}/{requirement.minimumSources}</dd>
                  <small>{requirement.purpose}</small>
                </div>
              ))}
            </dl>
          </div>
          <div className="market-source-scout-form">
            <label htmlFor="source-scout-reason">Coverage-review reason</label>
            <textarea id="source-scout-reason" value={reason} onChange={(event) => setReason(event.target.value)} maxLength={600} />
            <button type="button" onClick={requestScout} disabled={pending || !reason.trim()}>{pending ? 'Queuing scout…' : 'Queue bounded source scout'}</button>
            <button type="button" className="market-source-secondary-button" onClick={requestHealthAudit} disabled={pending}>{pending ? 'Queuing audit…' : 'Run source health audit'}</button>
            <p>Uses the low-cost scout tier and returns at most 12 direct canonical source candidates. It cannot approve a source, ingest evidence, activate a domain, create a thesis, or move capital.</p>
            <p>A health audit checks reachability, redirect destination, and MIME type against the active contract. A failed check is review telemetry, not an automatic source block.</p>
            {notice ? <output aria-live="polite">{notice}</output> : null}
          </div>
        </div>
      ) : null}

      <div className="market-source-control-ledger">
        <div>
          <p className="markets-eyebrow">Review ledger</p>
          <h3>Recent source candidates</h3>
          {candidates.length ? candidates.slice(0, 8).map((source) => (
            <article key={source.id}>
              <div><strong>{source.label}</strong><span>{source.publisher} · {source.evidenceClasses.join(', ').replaceAll('_', ' ')}</span></div>
              <time>{formatDate(source.updatedAt)}</time>
            </article>
          )) : <p>No candidate sources are awaiting review.</p>}
        </div>
        <div>
          <p className="markets-eyebrow">Scout trail</p>
          <h3>Recent discovery runs</h3>
          {workspace.discoveryRuns.length ? workspace.discoveryRuns.slice(0, 6).map((run) => (
            <article key={run.id}>
              <div><strong>{run.domainId.replaceAll('-', ' ')}</strong><span>{run.status} · {run.candidates.length} candidates · {run.model ?? 'model pending'}</span></div>
              <time>{formatDate(run.generatedAt ?? run.createdAt)}</time>
            </article>
          )) : <p>No source-scout runs have been recorded.</p>}
        </div>
      </div>
    </section>
  )
}

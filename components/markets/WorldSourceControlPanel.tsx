'use client'

import { useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'
import type { MarketDomainPack, WorldSourceControlWorkspaceData, WorldSourceRegistryEntry } from '@/lib/markets/types'
import { candidateResearchFrontiers, prioritizeWorldObservationProposals, prioritizeWorldSourceCandidates } from '@/lib/markets/source-review-priority'

type SourceStatus = 'approved' | 'probation'

function isAdmittedSource(status: string): status is SourceStatus {
  return status === 'approved' || status === 'probation'
}

function isApprovedSource(status: string): status is Extract<SourceStatus, 'approved'> {
  return status === 'approved'
}

function domainSources(workspace: WorldSourceControlWorkspaceData, domainId: string) {
  return workspace.sources.filter((source) => source.domainIds.includes(domainId))
}

function sourceCoverage(workspace: WorldSourceControlWorkspaceData, domain: MarketDomainPack) {
  const sources = domainSources(workspace, domain.id).filter((source) => isApprovedSource(source.status))
  return domain.sourceRequirements.map((requirement) => ({
    ...requirement,
    current: new Set(sources.filter((source) => source.evidenceClasses.includes(requirement.evidenceClass)).map((source) => source.id)).size,
  }))
}

function formatDate(value: string | null): string {
  if (!value) return 'Not generated'
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/New_York' }).format(new Date(value))
}

type ContractDraft = {
  allowedHosts: string
  allowedPaths: string
  acceptedMimeTypes: string
  cadence: 'event' | 'daily' | 'weekly' | 'monthly'
  assertionsAllowed: string
  retentionDays: string
  notes: string
  reason: string
}

const CADENCES: ContractDraft['cadence'][] = ['event', 'daily', 'weekly', 'monthly']

function defaultContract(source: WorldSourceRegistryEntry): ContractDraft {
  let url: URL | null = null
  try { url = new URL(source.canonicalUrl) } catch { /* Server validation remains authoritative. */ }
  const mime = source.sourceKind === 'pdf' ? 'application/pdf'
    : source.sourceKind === 'api' ? 'application/json'
      : source.sourceKind === 'dataset' ? 'application/json, text/csv'
        : 'text/html'
  return {
    allowedHosts: url?.hostname ?? '', allowedPaths: url?.pathname && url.pathname !== '/' ? url.pathname : '', acceptedMimeTypes: mime,
    cadence: source.sourceKind === 'filing' || source.sourceKind === 'transcript' ? 'event' : 'monthly', assertionsAllowed: 'fact, estimate, claim', retentionDays: '365',
    notes: `Reviewed direct canonical ${source.sourceKind} source for ${source.domainIds.join(', ') || 'market research'} coverage.`,
    reason: `Reviewed ${source.publisher}'s direct canonical source and bounded its contract before admitting it to governed evidence.`,
  }
}

function listValue(value: string): string[] {
  return value.split(',').map((item) => item.trim()).filter(Boolean)
}

export function WorldSourceControlPanel({ workspace, unavailableReason }: { workspace: WorldSourceControlWorkspaceData | null; unavailableReason: string | null }) {
  const router = useRouter()
  const [selectedDomainId, setSelectedDomainId] = useState(workspace?.domains[0]?.id ?? '')
  const [candidateLimit, setCandidateLimit] = useState(12)
  const [proposalLimit, setProposalLimit] = useState(12)
  const [reason, setReason] = useState('Review source coverage gaps before expanding this domain.')
  const [pending, setPending] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [reviewing, setReviewing] = useState<string | null>(null)
  const [contract, setContract] = useState<ContractDraft | null>(null)
  const [blockingCandidate, setBlockingCandidate] = useState<string | null>(null)
  const [blockRationale, setBlockRationale] = useState('')
  const [activatingDomainId, setActivatingDomainId] = useState<string | null>(null)
  const [activationReason, setActivationReason] = useState('')
  const [reviewingProposal, setReviewingProposal] = useState<string | null>(null)
  const [proposalRationale, setProposalRationale] = useState('')
  const [revisingCanonicalSlug, setRevisingCanonicalSlug] = useState<string | null>(null)
  const [canonicalUrl, setCanonicalUrl] = useState('')
  const [canonicalRationale, setCanonicalRationale] = useState('')
  const selectedDomain = useMemo(() => workspace?.domains.find((domain) => domain.id === selectedDomainId) ?? null, [workspace, selectedDomainId])
  const selectedDomainCoverage = useMemo(() => selectedDomain ? sourceCoverage(workspace!, selectedDomain) : [], [workspace, selectedDomain])
  const selectedDomainComplete = selectedDomainCoverage.every((item) => item.current >= item.minimumSources)

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
  const scopedCandidates = selectedDomain
    ? prioritizeWorldSourceCandidates(workspace.sources, selectedDomain)
    : candidates.map((source) => ({ source, closesCoverageGaps: [] }))
  const visibleCandidates = scopedCandidates.slice(0, candidateLimit)
  const hasMoreCandidates = visibleCandidates.length < scopedCandidates.length
  const scopedProposals = prioritizeWorldObservationProposals(workspace.observationProposals, workspace.researchFrontiers, selectedDomain?.id)
  const visibleProposals = scopedProposals.slice(0, proposalLimit)
  const hasMoreProposals = visibleProposals.length < scopedProposals.length
  const failedRuns = workspace.discoveryRuns.filter((run) => run.status === 'failed')
  const health = workspace.sources.flatMap((source) => source.health ? [source.health] : [])
  const triageAttention = workspace.triageRuns.filter((run) => run.status !== 'succeeded')
  const researchLeads = workspace.researchScoutRuns.filter((run) => run.status === 'complete')
    .flatMap((run) => run.leads.map((lead) => ({ run, lead }))).slice(0, 12)
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
      const payload = await response.json() as { error?: string; deduplicated?: boolean }
      if (!response.ok) throw new Error(payload.error ?? 'Unable to queue source scout')
      setNotice(payload.deduplicated
        ? `A bounded scout for ${selectedDomain.label} is already queued or completed today. No additional model run was started.`
        : `Scout queued for ${selectedDomain.label}. It can only create candidate sources; a reviewed contract is still required before ingestion.`)
      router.refresh()
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Unable to queue source scout')
    } finally {
      setPending(false)
    }
  }

  const requestBroadResearch = async () => {
    if (!selectedDomain || !reason.trim() || pending) return
    setPending(true)
    setNotice(null)
    try {
      const response = await fetch('/api/markets/world-sources', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'scout-broad-research', domainId: selectedDomain.id, reason: reason.trim() }),
      })
      const payload = await response.json() as { error?: string; deduplicated?: boolean }
      if (!response.ok) throw new Error(payload.error ?? 'Unable to queue broad research')
      setNotice(payload.deduplicated
        ? `A broad-research scout for this exact domain/question is already queued or completed today.`
        : `Broad research queued for ${selectedDomain.label}. It will return provisional cited leads, including counter-evidence where found; it cannot create market evidence or a thesis.`)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Unable to queue broad research')
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
      const payload = await response.json() as { error?: string; deduplicated?: boolean }
      if (!response.ok) throw new Error(payload.error ?? 'Unable to queue source health audit')
      setNotice(payload.deduplicated
        ? 'A source health audit is already queued or completed today. No additional probe run was started.'
        : 'Source health audit queued. It probes approved contracts only and records review telemetry; it does not change source admission.')
      router.refresh()
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Unable to queue source health audit')
    } finally {
      setPending(false)
    }
  }

  const activateDomain = async (domain: MarketDomainPack) => {
    if (!activationReason.trim() || pending) return
    setPending(true)
    setNotice(null)
    try {
      const response = await fetch('/api/markets/world-sources', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'activate-domain', domainId: domain.id, reason: activationReason.trim() }),
      })
      const payload = await response.json() as { error?: string }
      if (!response.ok) throw new Error(payload.error ?? 'Unable to activate market domain')
      setNotice(`${domain.label} is active. Only its approved, contract-bounded sources may enter the scheduled collection path; candidates remain outside evidence.`)
      setActivatingDomainId(null)
      setActivationReason('')
      router.refresh()
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Unable to activate market domain')
    } finally {
      setPending(false)
    }
  }

  const startReview = (source: WorldSourceRegistryEntry) => {
    setReviewing(source.id)
    setContract(defaultContract(source))
    setBlockingCandidate(null)
    setNotice(null)
  }

  const preflightCandidate = async (source: WorldSourceRegistryEntry) => {
    if (pending) return
    setPending(true)
    setNotice(null)
    try {
      const response = await fetch('/api/markets/world-sources', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'preflight-candidate', slug: source.slug }),
      })
      const payload = await response.json() as { error?: string; deduplicated?: boolean }
      if (!response.ok) throw new Error(payload.error ?? 'Unable to queue candidate preflight')
      setNotice(payload.deduplicated
        ? `${source.label} already has a candidate preflight queued or completed today.`
        : `${source.label} preflight queued on the worker. It records only reachability, redirect, and MIME telemetry; it cannot approve the source.`)
      router.refresh()
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Unable to queue candidate preflight')
    } finally {
      setPending(false)
    }
  }

  const blockCandidate = async (source: WorldSourceRegistryEntry) => {
    if (!blockRationale.trim() || pending) return
    setPending(true)
    setNotice(null)
    try {
      const response = await fetch('/api/markets/world-sources', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'block', slug: source.slug, reason: blockRationale.trim() }),
      })
      const payload = await response.json() as { error?: string }
      if (!response.ok) throw new Error(payload.error ?? 'Unable to block source candidate')
      setNotice(`${source.label} is blocked. Its discovery record remains available, but it cannot be approved or collected.`)
      setBlockingCandidate(null)
      setBlockRationale('')
      router.refresh()
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Unable to block source candidate')
    } finally {
      setPending(false)
    }
  }

  const approveCandidate = async (source: WorldSourceRegistryEntry) => {
    if (!contract || pending) return
    setPending(true)
    setNotice(null)
    try {
      const response = await fetch('/api/markets/world-sources', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
          action: 'approve', slug: source.slug, reason: contract.reason,
          contract: {
            allowedHosts: listValue(contract.allowedHosts), allowedPaths: listValue(contract.allowedPaths), acceptedMimeTypes: listValue(contract.acceptedMimeTypes), cadence: contract.cadence,
            assertionsAllowed: listValue(contract.assertionsAllowed), retentionDays: contract.retentionDays.trim() ? Number(contract.retentionDays) : null, notes: contract.notes,
          },
        }),
      })
      const payload = await response.json() as { error?: string }
      if (!response.ok) throw new Error(payload.error ?? 'Unable to approve source contract')
      setNotice(`${source.label} is approved with an active contract. Its first bounded immutable capture is queued; event sources are captured once and remain event-driven afterward.`)
      setReviewing(null)
      setContract(null)
      router.refresh()
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Unable to approve source contract')
    } finally {
      setPending(false)
    }
  }

  const reviewProposal = async (proposalId: string, decision: 'accepted' | 'rejected') => {
    if (!proposalRationale.trim() || pending) return
    setPending(true)
    setNotice(null)
    try {
      const response = await fetch('/api/markets/world-sources', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'review-observation-proposal', proposalId, decision, rationale: proposalRationale.trim() }) })
      const payload = await response.json() as { error?: string; analysisQueued?: boolean }
      if (!response.ok) throw new Error(payload.error ?? 'Unable to record evidence review')
      setNotice(decision === 'accepted'
        ? `Proposal accepted as a governed observation.${payload.analysisQueued ? ' A bounded analyst revision is queued.' : ''} It remains evidence, not a thesis or capital decision.`
        : 'Proposal rejected. Its immutable source and review record remain available.')
      setReviewingProposal(null)
      setProposalRationale('')
      router.refresh()
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Unable to record evidence review')
    } finally {
      setPending(false)
    }
  }

  const startCanonicalRevision = (source: WorldSourceRegistryEntry) => {
    setRevisingCanonicalSlug(source.slug)
    setCanonicalUrl(source.canonicalUrl)
    setCanonicalRationale('Replace an operationally unsuitable canonical target with a direct, contract-permitted source URL.')
    setNotice(null)
  }

  const reviseCanonicalUrl = async (source: WorldSourceRegistryEntry) => {
    if (!canonicalUrl.trim() || !canonicalRationale.trim() || pending) return
    setPending(true)
    setNotice(null)
    try {
      const response = await fetch('/api/markets/world-sources', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'revise-canonical-url', slug: source.slug, canonicalUrl: canonicalUrl.trim(), rationale: canonicalRationale.trim() }),
      })
      const payload = await response.json() as { error?: string }
      if (!response.ok) throw new Error(payload.error ?? 'Unable to revise canonical source URL')
      setNotice(`${source.label}'s canonical URL was revised and audit-recorded. The collector will use it only within the existing active contract.`)
      setRevisingCanonicalSlug(null)
      setCanonicalUrl('')
      setCanonicalRationale('')
      router.refresh()
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Unable to revise canonical source URL')
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
          <div><dt>Governed sources</dt><dd>{workspace.sources.filter((source) => isAdmittedSource(source.status)).length}</dd></div>
          <div><dt>Latest healthy</dt><dd>{health.filter((check) => check.status === 'healthy').length}/{health.length || '—'}</dd></div>
          <div><dt>Pending review</dt><dd>{candidates.length}</dd></div>
          <div><dt>Evidence proposals</dt><dd>{workspace.observationProposals.length}</dd></div>
          <div><dt>Triage attention</dt><dd>{triageAttention.length}</dd></div>
          <div><dt>Failed scouts</dt><dd>{failedRuns.length}</dd></div>
        </dl>
      </div>

      <div className="market-domain-control-grid" role="list" aria-label="Market research domains">
        {workspace.domains.map((domain) => {
          const coverage = sourceCoverage(workspace, domain)
          const complete = coverage.every((item) => item.current >= item.minimumSources)
          const selected = selectedDomainId === domain.id
          return (
              <button key={domain.id} type="button" className="market-domain-control-card" data-selected={selected} onClick={() => { setSelectedDomainId(domain.id); setCandidateLimit(12); setProposalLimit(12); setReviewing(null); setContract(null); setBlockingCandidate(null); setBlockRationale(''); setActivatingDomainId(null); setActivationReason(''); setReviewingProposal(null); setProposalRationale('') }} role="listitem">
              <span data-status={domain.status}>{domain.status}</span>
              <strong>{domain.label}</strong>
              <small>{complete ? 'Approved coverage requirement met' : 'Approved coverage gap remains'}</small>
              <em>{coverage.filter((item) => item.current >= item.minimumSources).length}/{coverage.length} approved source classes satisfied</em>
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
              {selectedDomainCoverage.map((requirement) => (
                <div key={requirement.evidenceClass} data-complete={requirement.current >= requirement.minimumSources}>
                  <dt>{requirement.evidenceClass.replaceAll('_', ' ')}</dt>
                  <dd>{requirement.current}/{requirement.minimumSources}</dd>
                  <small>{requirement.purpose}</small>
                </div>
              ))}
            </dl>
          </div>
          <div className="market-source-scout-form">
            <label htmlFor="source-scout-reason">Research question or coverage reason</label>
            <textarea id="source-scout-reason" value={reason} onChange={(event) => setReason(event.target.value)} maxLength={600} />
            <button type="button" onClick={requestBroadResearch} disabled={pending || !reason.trim()}>{pending ? 'Queuing scout…' : 'Queue broad research scout'}</button>
            <button type="button" className="market-source-secondary-button" onClick={requestScout} disabled={pending || !reason.trim()}>Queue recurring-source scout</button>
            <button type="button" className="market-source-secondary-button" onClick={requestHealthAudit} disabled={pending}>{pending ? 'Queuing audit…' : 'Run source health audit'}</button>
            <p>Broad research uses the standard research tier to return a compact, cited, and deliberately mixed lead dossier. The separate low-cost source scout only proposes recurring collection candidates. They cannot approve a source, ingest evidence, activate a domain, create a thesis, or move capital.</p>
            <p>A health audit checks reachability, redirect destination, and MIME type against the active contract. A failed check is review telemetry, not an automatic source block.</p>
            {selectedDomain.status === 'candidate' ? activatingDomainId === selectedDomain.id ? <form className="market-source-contract-review market-domain-activation-review" onSubmit={(event) => { event.preventDefault(); void activateDomain(selectedDomain) }}>
              <p>Activation is a human decision after every required source class has approved, contract-bounded coverage. It enables scheduled collection for approved sources only; it does not admit candidates, create observations, publish a thesis, or move capital.</p>
              <label>Activation rationale<textarea value={activationReason} onChange={(event) => setActivationReason(event.target.value)} required maxLength={1000} /></label>
              <footer><button type="submit" disabled={pending || !selectedDomainComplete || !activationReason.trim()}>{pending ? 'Activating domain…' : 'Activate verified domain'}</button><button type="button" className="market-source-secondary-button" disabled={pending} onClick={() => { setActivatingDomainId(null); setActivationReason('') }}>Cancel</button></footer>
            </form> : <div className="market-domain-activation-summary"><button type="button" className="market-source-secondary-button" disabled={pending || !selectedDomainComplete} onClick={() => { setActivatingDomainId(selectedDomain.id); setActivationReason(''); setNotice(null) }}>Review domain activation</button><small>{selectedDomainComplete ? 'All required source classes have approved coverage. Activation remains a separately recorded human decision.' : 'Activation remains unavailable until every required source class has approved coverage.'}</small></div> : null}
            {notice ? <output aria-live="polite">{notice}</output> : null}
          </div>
        </div>
      ) : null}

      <div className="market-source-control-ledger">
        <div>
          <p className="markets-eyebrow">Review ledger</p>
          <h3>{selectedDomain ? `${selectedDomain.label} source candidates` : 'Source candidates'}</h3>
          <p className="market-source-candidate-summary">Showing {visibleCandidates.length} of {scopedCandidates.length} candidate{scopedCandidates.length === 1 ? '' : 's'} mapped to the selected domain. Candidates may support more than one domain.</p>
          {scopedCandidates.length ? visibleCandidates.map(({ source, closesCoverageGaps }) => {
            const frontiers = candidateResearchFrontiers(source, workspace.discoveryRuns, workspace.researchFrontiers)
            return (
            <article key={source.id}>
              <div><strong>{source.label}</strong><span>{source.publisher} · {source.evidenceClasses.join(', ').replaceAll('_', ' ')}</span>
                {closesCoverageGaps.length ? <small className="market-source-coverage-priority">Closes coverage gap: {closesCoverageGaps.join(', ').replaceAll('_', ' ')}</small> : null}
                {frontiers.length ? <small className="market-source-frontier-priority">Research frontier: {frontiers[0]?.causalNode}{frontiers.length > 1 ? ` +${frontiers.length - 1} related gap${frontiers.length === 2 ? '' : 's'}` : ''}</small> : null}
                {source.candidateContext ? <div className="market-source-candidate-context"><p><b>Coverage:</b> {source.candidateContext.coverage || 'Not supplied'}</p><p><b>Why this source:</b> {source.candidateContext.whyThisSource || 'Not supplied'}</p><small>Deterministic score {source.candidateContext.deterministicScore ?? '—'} · scout score {source.candidateContext.scoutScore ?? '—'}{source.candidateContext.limitations.length ? ` · limitations: ${source.candidateContext.limitations.join('; ')}` : ''}</small></div> : null}
                {source.health ? <small className="market-source-preflight-status">Latest target preflight: {source.health.status} · {formatDate(source.health.checkedAt)}{source.health.error ? ` · ${source.health.error}` : ''}</small> : <small className="market-source-preflight-status">No worker preflight recorded yet.</small>}
                <a href={source.canonicalUrl} target="_blank" rel="noreferrer">Open canonical source</a></div>
              <time>{formatDate(source.updatedAt)}</time>
              {reviewing === source.id && contract ? <form className="market-source-contract-review" onSubmit={(event) => { event.preventDefault(); void approveCandidate(source) }}>
                <p>Review every boundary below. Candidate approval requires a fresh healthy worker preflight whose resolved target and MIME type fit this exact contract. Approval activates this contract; it does not ingest evidence or activate a domain.</p>
                <label>Allowed hosts<input value={contract.allowedHosts} onChange={(event) => setContract({ ...contract, allowedHosts: event.target.value })} required /></label>
                <label>Allowed paths (comma separated; blank allows any path on the approved host)<input value={contract.allowedPaths} onChange={(event) => setContract({ ...contract, allowedPaths: event.target.value })} /></label>
                <label>Accepted MIME types (comma separated)<input value={contract.acceptedMimeTypes} onChange={(event) => setContract({ ...contract, acceptedMimeTypes: event.target.value })} required /></label>
                <fieldset className="market-source-cadence"><legend>Cadence</legend><div>{CADENCES.map((cadence) => <button key={cadence} type="button" data-selected={contract.cadence === cadence} onClick={() => setContract({ ...contract, cadence })}>{cadence}</button>)}</div></fieldset>
                <label>Allowed assertion kinds (comma separated)<input value={contract.assertionsAllowed} onChange={(event) => setContract({ ...contract, assertionsAllowed: event.target.value })} required /></label>
                <label>Retention days (blank for no expiry)<input inputMode="numeric" value={contract.retentionDays} onChange={(event) => setContract({ ...contract, retentionDays: event.target.value })} /></label>
                <label>Contract notes<textarea value={contract.notes} onChange={(event) => setContract({ ...contract, notes: event.target.value })} required maxLength={1000} /></label>
                <label>Approval rationale<textarea value={contract.reason} onChange={(event) => setContract({ ...contract, reason: event.target.value })} required maxLength={1000} /></label>
                <footer><button type="submit" disabled={pending}>{pending ? 'Activating contract…' : 'Approve reviewed contract'}</button><button type="button" className="market-source-secondary-button" disabled={pending} onClick={() => { setReviewing(null); setContract(null) }}>Cancel</button></footer>
              </form> : blockingCandidate === source.id ? <form className="market-source-contract-review" onSubmit={(event) => { event.preventDefault(); void blockCandidate(source) }}>
                <p>Blocking preserves this candidate and its discovery trail, but permanently prevents approval and collection. Use it for an invalid, overly broad, or unsuitable source.</p>
                <label>Block rationale<textarea value={blockRationale} onChange={(event) => setBlockRationale(event.target.value)} required maxLength={1000} /></label>
                <footer><button type="submit" className="market-source-block-button" disabled={pending || !blockRationale.trim()}>{pending ? 'Blocking…' : 'Block candidate'}</button><button type="button" className="market-source-secondary-button" disabled={pending} onClick={() => { setBlockingCandidate(null); setBlockRationale('') }}>Cancel</button></footer>
              </form> : <footer className="market-source-candidate-actions"><button type="button" className="market-source-secondary-button" onClick={() => preflightCandidate(source)} disabled={pending}>{pending ? 'Queuing preflight…' : 'Preflight direct target'}</button><button type="button" className="market-source-review-button" onClick={() => startReview(source)} disabled={pending}>Review contract</button><button type="button" className="market-source-secondary-button market-source-block-button" onClick={() => { setBlockingCandidate(source.id); setReviewing(null); setContract(null); setBlockRationale(''); setNotice(null) }} disabled={pending}>Block candidate</button></footer>}
            </article>
            )
          }) : <p>No candidate sources are awaiting review for this domain.</p>}
          {hasMoreCandidates ? <button type="button" className="market-source-review-button" onClick={() => setCandidateLimit((limit) => Math.min(limit + 12, scopedCandidates.length))} disabled={pending}>Show 12 more candidates</button> : null}
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
          <p className="markets-eyebrow">Broad research</p>
          <h3>Provisional lead dossiers</h3>
          <p>Research agents search beyond the governed registry. These attributable leads can challenge or direct follow-up, but cannot become evidence or recurring collection automatically.</p>
          {researchLeads.length ? researchLeads.map(({ run, lead }) => (
            <article key={`${run.id}:${lead.url}`}>
              <div><strong><a href={lead.url} target="_blank" rel="noreferrer">{lead.title}</a></strong><span>{run.domainId.replaceAll('-', ' ')} · {lead.supports} · {lead.publisher}</span><p>{lead.claim}</p><blockquote>{lead.evidenceQuote}</blockquote><small>{lead.sourceType}{lead.recurringSourceCandidate ? ' · recurring-source candidate only' : ''}</small></div>
              <time>{formatDate(run.generatedAt ?? run.createdAt)}</time>
            </article>
          )) : <p>No completed broad-research dossiers yet.</p>}
        </div>
        <div className="market-source-triage">
          <p className="markets-eyebrow">Operational telemetry</p>
          <h3>Capture and triage outcomes</h3>
          <p>Failures and short extracts remain raw-source telemetry. They do not create evidence, change admission, or trigger a source revision automatically.</p>
          {workspace.triageRuns.length ? workspace.triageRuns.slice(0, 12).map((run) => {
            const source = workspace.sources.find((item) => item.slug === run.sourceSlug) ?? null
            return (
              <article key={run.id} data-status={run.status}>
                <div>
                  <strong>{run.sourceLabel}</strong>
                  <span>{run.status} · {run.proposalCount} proposals · {run.model ?? 'no model recorded'}</span>
                  {run.error ? <p>{run.error}</p> : null}
                  <a href={run.sourceUrl} target="_blank" rel="noreferrer">Open canonical source</a>
                  {source && run.status !== 'succeeded' ? revisingCanonicalSlug === source.slug ? (
                    <form className="market-source-contract-review" onSubmit={(event) => { event.preventDefault(); void reviseCanonicalUrl(source) }}>
                      <p>Changing a canonical target is a human action. This form permits only an HTTPS URL already allowed by the active host/path contract; it never broadens collection authority.</p>
                      <label>Replacement canonical URL<input type="url" value={canonicalUrl} onChange={(event) => setCanonicalUrl(event.target.value)} required /></label>
                      <label>Revision rationale<textarea value={canonicalRationale} onChange={(event) => setCanonicalRationale(event.target.value)} required maxLength={1000} /></label>
                      <footer><button type="submit" disabled={pending || !canonicalUrl.trim() || !canonicalRationale.trim()}>{pending ? 'Recording…' : 'Record canonical revision'}</button><button type="button" className="market-source-secondary-button" disabled={pending} onClick={() => { setRevisingCanonicalSlug(null); setCanonicalUrl(''); setCanonicalRationale('') }}>Cancel</button></footer>
                    </form>
                  ) : <button type="button" className="market-source-review-button" disabled={pending} onClick={() => startCanonicalRevision(source)}>Revise canonical URL</button> : null}
                </div>
                <time>{formatDate(run.completedAt)}</time>
              </article>
            )
          }) : <p>No triage attempts have been recorded yet.</p>}
        </div>
        <div className="market-source-proposals">
          <p className="markets-eyebrow">Proposal ledger</p>
          <h3>{selectedDomain ? `${selectedDomain.label} quote-bound proposals` : 'Quote-bound observation proposals'}</h3>
          <p>Low-cost extraction proposals are not accepted observations. They never enter baselines, hypotheses, predictions, or capital decisions without a separate evidence-review gate.</p>
          <p className="market-source-proposal-summary">Showing {visibleProposals.length} of {scopedProposals.length} proposal{scopedProposals.length === 1 ? '' : 's'} mapped to the selected domain.</p>
          {scopedProposals.length ? visibleProposals.map(({ proposal, advancesFrontiers }) => (
            <article key={proposal.id}>
              <div><strong>{proposal.domainId.replaceAll('-', ' ')} · {proposal.mechanism.replaceAll('_', ' ')}</strong><span>{proposal.kind} · confidence {proposal.confidence} · materiality {proposal.materiality}</span>{advancesFrontiers.length ? <small className="market-source-frontier-priority">Addresses research frontier: {advancesFrontiers[0]?.causalNode}{advancesFrontiers.length > 1 ? ` +${advancesFrontiers.length - 1} related gap${advancesFrontiers.length === 2 ? '' : 's'}` : ''} · review still decides whether the quote is evidence</small> : null}<p>{proposal.assertion}</p><blockquote>{proposal.evidenceQuote}</blockquote><a href={proposal.sourceUrl} target="_blank" rel="noreferrer">{proposal.sourceLabel}</a>
                {proposal.review ? <small className="market-proposal-review" data-decision={proposal.review.decision}>{proposal.review.decision} · {proposal.review.rationale}</small>
                  : reviewingProposal === proposal.id ? <form className="market-source-contract-review" onSubmit={(event) => { event.preventDefault(); void reviewProposal(proposal.id, 'accepted') }}><p>Accepting creates one governed observation from this exact quote. It does not create a thesis or investment decision.</p><label>Review rationale<textarea value={proposalRationale} onChange={(event) => setProposalRationale(event.target.value)} required maxLength={1000} /></label><footer><button type="submit" disabled={pending || !proposalRationale.trim()}>{pending ? 'Recording…' : 'Accept as observation'}</button><button type="button" className="market-source-secondary-button" disabled={pending || !proposalRationale.trim()} onClick={() => void reviewProposal(proposal.id, 'rejected')}>Reject proposal</button><button type="button" className="market-source-secondary-button" disabled={pending} onClick={() => { setReviewingProposal(null); setProposalRationale('') }}>Cancel</button></footer></form>
                    : <button type="button" className="market-source-review-button" disabled={pending} onClick={() => { setReviewingProposal(proposal.id); setProposalRationale('') }}>Review proposal</button>}
              </div>
              <time>{formatDate(proposal.generatedAt)}</time>
            </article>
          )) : <p>No extracted observation proposals are awaiting review for this domain.</p>}
          {hasMoreProposals ? <button type="button" className="market-source-review-button" onClick={() => setProposalLimit((limit) => Math.min(limit + 12, scopedProposals.length))} disabled={pending}>Show 12 more proposals</button> : null}
        </div>
      </div>
    </section>
  )
}

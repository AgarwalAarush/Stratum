'use client'

import { ArrowClockwise, Flask, XCircle } from '@phosphor-icons/react'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

async function performWorldAction(payload: Record<string, unknown>): Promise<void> {
  const response = await fetch('/api/markets/world/actions', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
  })
  if (!response.ok) {
    const result = await response.json().catch(() => ({})) as { error?: string }
    throw new Error(result.error ?? 'The World Thinker action failed')
  }
}

export function WorldRefreshAction() {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const refresh = () => startTransition(async () => {
    try { setError(null); await performWorldAction({ action: 'manual-refresh' }); router.refresh() }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Refresh failed') }
  })
  return (
    <div className="world-action-wrap">
      <button type="button" className="world-action-button" onClick={refresh} disabled={pending}>
        <ArrowClockwise size={15} className={pending ? 'markets-refreshing' : ''} />
        {pending ? 'Queueing…' : 'Refresh world'}
      </button>
      {error ? <p className="world-action-error" role="alert">{error}</p> : null}
    </div>
  )
}

export function WorldLeadActions({ leadId, status }: { leadId: string; status: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const act = (action: 'investigate-lead' | 'dismiss-lead') => {
    const reason = action === 'dismiss-lead' ? window.prompt('Why should the Thinker stop surfacing this lead?')?.trim() : undefined
    if (action === 'dismiss-lead' && !reason) return
    startTransition(async () => {
    try {
      setError(null)
      await performWorldAction({ action, leadId, ...(reason ? { reason } : {}) })
      router.refresh()
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Action failed') }
    })
  }
  if (status === 'dismissed') return <span className="world-lead-state">Dismissed</span>
  return (
    <div className="world-lead-actions">
      <button type="button" onClick={() => act('investigate-lead')} disabled={pending || ['queued', 'researching'].includes(status)}>
        <Flask size={14} /> {status === 'researched' ? 'Refresh research' : ['queued', 'researching'].includes(status) ? 'Research queued' : 'Investigate'}
      </button>
      {status === 'new' || status === 'researched' ? <button type="button" onClick={() => act('dismiss-lead')} disabled={pending}><XCircle size={14} /> Dismiss</button> : null}
      {error ? <span className="world-action-error" role="alert">{error}</span> : null}
    </div>
  )
}

export function WorldSystemAction({ action, label, payload = {} }: { action: 'resume-replay' | 'refresh-frontier' | 'retry-replay-batch' | 'retry-quarantined-event'; label: string; payload?: Record<string, unknown> }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  return (
    <span className="world-system-action">
      <button type="button" onClick={() => startTransition(async () => {
        try { setError(null); await performWorldAction({ action, ...payload }); router.refresh() }
        catch (cause) { setError(cause instanceof Error ? cause.message : 'Action failed') }
      })} disabled={pending}>{pending ? 'Queueing…' : label}</button>
      {error ? <small role="alert">{error}</small> : null}
    </span>
  )
}

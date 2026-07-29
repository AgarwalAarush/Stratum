'use client'

import { useState } from 'react'

type CandidateAction = 'dismissed' | 'snoozed' | 'watchlisted' | 'promoted'

const RESULT_LABELS: Record<CandidateAction, string> = {
  dismissed: 'Candidate dismissed.',
  snoozed: 'Candidate snoozed for five trading days.',
  watchlisted: 'Candidate added to your watchlist.',
  promoted: 'Full research queued.',
}

export function CandidateActions({ candidateId }: { candidateId: string }) {
  const [status, setStatus] = useState<CandidateAction | 'idle' | 'saving'>('idle')
  const act = async (action: CandidateAction) => {
    setStatus('saving')
    const response = await fetch(`/api/markets/candidates/${encodeURIComponent(candidateId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: action }),
    })
    setStatus(response.ok ? action : 'idle')
  }
  if (status !== 'idle' && status !== 'saving') {
    return <p className="candidate-action-result">{RESULT_LABELS[status]}</p>
  }
  return (
    <div className="candidate-actions" aria-label="Candidate actions">
      <button type="button" onClick={() => act('dismissed')} disabled={status === 'saving'}>Dismiss</button>
      <button type="button" onClick={() => act('snoozed')} disabled={status === 'saving'}>Snooze</button>
      <button type="button" onClick={() => act('watchlisted')} disabled={status === 'saving'}>Add to Watchlist</button>
      <button type="button" onClick={() => act('promoted')} disabled={status === 'saving'}>Promote to Full Research</button>
    </div>
  )
}

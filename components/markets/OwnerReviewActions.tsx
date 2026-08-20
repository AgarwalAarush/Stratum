'use client'

import { useState } from 'react'

type Decision = 'in_review' | 'investigate' | 'accepted' | 'rejected' | 'no_trade' | 'revised' | 'deferred'

export function OwnerReviewActions({ itemId, decisionType }: { itemId: string; decisionType: string }) {
  const [pending, setPending] = useState<Decision | null>(null)
  const [error, setError] = useState<string | null>(null)
  const decide = async (status: Decision) => {
    setPending(status)
    setError(null)
    try {
      const response = await fetch('/api/markets/review-inbox/actions', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ itemId, status }),
      })
      const payload = await response.json() as { error?: string }
      if (!response.ok) throw new Error(payload.error ?? 'Unable to save decision')
      window.location.reload()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to save decision')
      setPending(null)
    }
  }
  const primary = decisionType === 'investigate_company' ? 'investigate' : 'in_review'
  return <div className="owner-review-actions">
    <button type="button" onClick={() => decide(primary)} disabled={pending !== null}>{pending === primary ? 'Saving…' : primary === 'investigate' ? 'Investigate' : 'Review'}</button>
    <button type="button" onClick={() => decide('no_trade')} disabled={pending !== null}>No trade</button>
    <button type="button" onClick={() => decide('deferred')} disabled={pending !== null}>Defer</button>
    {error ? <small role="alert">{error}</small> : null}
  </div>
}

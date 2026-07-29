'use client'

import { useState } from 'react'

export function ResearchActionButton({
  symbol,
  hasResearch,
}: {
  symbol: string
  hasResearch: boolean
}) {
  const [status, setStatus] = useState<'idle' | 'submitting' | 'queued' | 'error'>('idle')
  const submit = async () => {
    setStatus('submitting')
    try {
      const response = await fetch('/api/markets/research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol, refresh: hasResearch }),
      })
      if (!response.ok) throw new Error('Unable to queue research')
      setStatus('queued')
    } catch {
      setStatus('error')
    }
  }
  return (
    <div className="research-action">
      <button type="button" onClick={submit} disabled={status === 'submitting' || status === 'queued'}>
        {status === 'submitting'
          ? 'Queueing…'
          : status === 'queued'
            ? 'Research queued'
            : hasResearch ? 'Refresh research' : 'Generate research'}
      </button>
      <span aria-live="polite">
        {status === 'queued' ? 'The macserver worker will build and version this report in the background.' : ''}
        {status === 'error' ? 'The job could not be queued.' : ''}
      </span>
    </div>
  )
}

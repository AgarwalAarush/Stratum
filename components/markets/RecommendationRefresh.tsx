'use client'
import { useRef, useState } from 'react'
export function RecommendationRefresh() {
  const [pending, setPending] = useState(false),
    [status, setStatus] = useState('')
  const request = useRef<string | null>(null)
  async function refresh() {
    setPending(true)
    try {
      request.current ??= crypto.randomUUID()
      const response = await fetch('/api/markets/recommendations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'refresh-edition',
          requestId: request.current,
        }),
      })
      const body = await response.json()
      if (!response.ok)
        throw new Error(body.error ?? 'Unable to request an update')
      setStatus(
        'Update queued. Reload after the worker finishes to see the new edition. Earlier editions remain in the ledger.',
      )
    } catch (error) {
      setStatus(
        error instanceof Error
          ? error.message
          : 'Unable to request an update',
      )
      setPending(false)
    }
  }
  return (
    <div className="mt-4 max-w-sm">
      <button
        type="button"
        disabled={pending}
        onClick={refresh}
        className="border border-[var(--border)] px-3 py-2 text-xs disabled:opacity-50"
      >
        {pending ? 'Update requested' : 'Request updated evaluation'}
      </button>
      <p
        role="status"
        className="mt-2 text-xs leading-5 text-[var(--text-muted)]"
      >
        {status}
      </p>
    </div>
  )
}

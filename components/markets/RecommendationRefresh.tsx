'use client'
import { useRef, useState } from 'react'
import { ArrowClockwise } from '@phosphor-icons/react'
import styles from './RecommendationsWorkspace.module.css'
export function RecommendationRefresh() {
  const [pending, setPending] = useState(false),
    [status, setStatus] = useState(''),
    [queued, setQueued] = useState(false)
  const request = useRef<string | null>(null)
  async function refresh() {
    if (pending || queued) return
    setPending(true)
    setStatus('')
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
        'Source checks queued. A fresh assessment will publish after the required refreshes finish.',
      )
      setQueued(true)
    } catch (error) {
      setStatus(
        error instanceof Error
          ? error.message
          : 'Unable to request an update',
      )
    } finally {
      setPending(false)
    }
  }
  return (
    <div className={styles.refresh}>
      <button
        type="button"
        disabled={pending || queued}
        onClick={refresh}
        className={styles.primaryButton}
      >
        <ArrowClockwise size={16} />
        {queued ? 'Assessment queued' : pending ? 'Requesting…' : 'Refresh assessment'}
      </button>
      {status && <p
        role="status"
        className="mt-2 text-xs leading-5 text-[var(--text-muted)]"
      >
        {status}
      </p>}
    </div>
  )
}

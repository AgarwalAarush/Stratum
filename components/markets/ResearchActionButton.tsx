'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { ResearchJobStatus } from '@/lib/markets/types'
import { ResearchProgressRing } from './ResearchProgressRing'

export function ResearchActionButton({
  symbol,
  hasResearch,
  currentVersion,
  instrumentType = 'equity',
}: {
  symbol: string
  hasResearch: boolean
  currentVersion?: number
  instrumentType?: 'equity' | 'etf'
}) {
  const router = useRouter()
  const [status, setStatus] = useState<'idle' | 'submitting' | 'error'>('idle')
  const [job, setJob] = useState<ResearchJobStatus | null>(null)
  const activeJobId = job && (job.status === 'queued' || job.status === 'running') ? job.id : null

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      const response = await fetch(`/api/markets/research?symbol=${encodeURIComponent(symbol)}`, { cache: 'no-store' })
      if (!response.ok) return
      const payload = await response.json() as { jobs?: ResearchJobStatus[] }
      const latest = payload.jobs?.[0] ?? null
      if (!cancelled && latest && (
        latest.status === 'queued'
        || latest.status === 'running'
        || (!hasResearch && latest.status === 'succeeded')
      )) setJob(latest)
    }
    void load()
    return () => { cancelled = true }
  }, [hasResearch, symbol])

  useEffect(() => {
    if (!activeJobId) return
    let cancelled = false
    const poll = async () => {
      const response = await fetch(`/api/markets/research?id=${encodeURIComponent(activeJobId)}`, { cache: 'no-store' })
      if (!response.ok) return
      const payload = await response.json() as { jobs?: ResearchJobStatus[] }
      const next = payload.jobs?.[0]
      if (!next || cancelled) return
      setJob(next)
      if (next.status === 'succeeded') router.refresh()
    }
    const interval = window.setInterval(() => void poll(), 2_500)
    void poll()
    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [activeJobId, router])

  const submit = async () => {
    setStatus('submitting')
    try {
      const response = await fetch('/api/markets/research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol, refresh: hasResearch, baseVersion: currentVersion }),
      })
      if (!response.ok) throw new Error('Unable to queue research')
      const payload = await response.json() as { id: string }
      setJob({
        id: payload.id,
        symbol,
        status: 'queued',
        progress: 8,
        phase: 'Waiting for research worker',
        error: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
      setStatus('idle')
    } catch {
      setStatus('error')
    }
  }

  if (job) {
    return (
      <div className="research-action">
        <ResearchProgressRing job={job} />
        {job.status === 'succeeded'
          ? <a href={`/markets/stocks/${symbol}/research`}>Open {instrumentType === 'etf' ? 'ETF' : 'full'} research →</a>
          : job.status === 'failed'
            ? <button type="button" onClick={() => setJob(null)}>Try again</button>
            : <Link href="/markets/research">View research queue →</Link>}
      </div>
    )
  }

  return (
    <div className="research-action">
      <button type="button" onClick={submit} disabled={status === 'submitting'}>
        {status === 'submitting'
          ? 'Queueing…'
          : hasResearch ? 'Refresh research' : instrumentType === 'etf' ? 'Generate ETF research' : 'Generate research'}
      </button>
      {status === 'error' ? <span aria-live="polite">The job could not be queued.</span> : null}
    </div>
  )
}

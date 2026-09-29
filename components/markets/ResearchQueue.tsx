'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { formatMarketDateTime } from '@/lib/markets/format-date'
import type { ResearchJobStatus } from '@/lib/markets/types'
import { ResearchProgressRing } from './ResearchProgressRing'
import styles from './ResearchQueue.module.css'

export function ResearchQueue({ initialJobs }: { initialJobs: ResearchJobStatus[] }) {
  const [jobs, setJobs] = useState(initialJobs)
  const [pollError, setPollError] = useState(false)
  const activeIds = jobs
    .filter((job) => job.status === 'queued' || job.status === 'running')
    .map((job) => job.id)
    .join(',')

  useEffect(() => {
    if (!activeIds) return
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    const poll = async () => {
      try {
        if (document.hidden) return
        const response = await fetch(`/api/markets/research?ids=${encodeURIComponent(activeIds)}`, { cache: 'no-store', signal: controller.signal })
        if (!response.ok) throw new Error('Queue unavailable')
        const payload = await response.json() as { jobs?: ResearchJobStatus[] }
        if (controller.signal.aborted) return
        const byId = new Map((payload.jobs ?? []).map(job => [job.id, job]))
        setJobs(current => current.map(job => byId.get(job.id) ?? job))
        setPollError(false)
      } catch {
        if (!controller.signal.aborted) setPollError(true)
      } finally {
        if (!controller.signal.aborted) timer = setTimeout(() => void poll(), 5_000)
      }
    }
    void poll()
    return () => {
      controller.abort()
      clearTimeout(timer)
    }
  }, [activeIds])

  if (jobs.length === 0) return null
  return (
    <section className="research-queue" aria-labelledby="research-queue-title">
      <details className={styles.disclosure}>
      <summary className={styles.summary}>
        <span id="research-queue-title">Research queue</span>
        <span className={styles.status}>{jobs.filter((job) => job.status === 'queued' || job.status === 'running').length} active · View progress</span>
      </summary>
      {pollError ? <p className={styles.error} role="status">Progress updates are temporarily unavailable. Retrying automatically.</p> : null}
      <div className="research-queue-list">
        {jobs.map((job) => (
          <Link key={job.id} href={`/markets/stocks/${job.symbol}/research`}>
            <ResearchProgressRing job={job} compact />
            <time dateTime={job.updatedAt}>{formatMarketDateTime(job.updatedAt)}</time>
          </Link>
        ))}
      </div>
      </details>
    </section>
  )
}

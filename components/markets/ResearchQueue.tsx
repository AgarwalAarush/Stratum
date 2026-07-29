'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { ResearchJobStatus } from '@/lib/markets/types'
import { ResearchProgressRing } from './ResearchProgressRing'

export function ResearchQueue({ initialJobs }: { initialJobs: ResearchJobStatus[] }) {
  const [jobs, setJobs] = useState(initialJobs)
  const activeIds = jobs
    .filter((job) => job.status === 'queued' || job.status === 'running')
    .map((job) => job.id)
    .join(',')

  useEffect(() => {
    if (!activeIds) return
    let cancelled = false
    const poll = async () => {
      const currentIds = activeIds.split(',')
      const updates = await Promise.all(currentIds.map(async (id) => {
        const response = await fetch(`/api/markets/research?id=${encodeURIComponent(id)}`, { cache: 'no-store' })
        if (!response.ok) return null
        const payload = await response.json() as { jobs?: ResearchJobStatus[] }
        return payload.jobs?.[0] ?? null
      }))
      if (cancelled) return
      const byId = new Map(updates.filter((job): job is ResearchJobStatus => Boolean(job)).map((job) => [job.id, job]))
      setJobs((current) => current.map((job) => byId.get(job.id) ?? job))
    }
    const interval = window.setInterval(() => void poll(), 2_500)
    void poll()
    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [activeIds])

  if (jobs.length === 0) return null
  return (
    <section className="research-queue" aria-labelledby="research-queue-title">
      <header>
        <div>
          <p className="markets-eyebrow">Durable background work</p>
          <h2 id="research-queue-title">Research queue</h2>
        </div>
        <span>{jobs.filter((job) => job.status === 'queued' || job.status === 'running').length} active</span>
      </header>
      <div className="research-queue-list">
        {jobs.map((job) => (
          <Link key={job.id} href={`/markets/stocks/${job.symbol}/research`}>
            <ResearchProgressRing job={job} compact />
            <time dateTime={job.updatedAt}>{new Date(job.updatedAt).toLocaleString()}</time>
          </Link>
        ))}
      </div>
    </section>
  )
}

import type { ResearchJobStatus } from '@/lib/markets/types'

export function ResearchProgressRing({
  job,
  compact = false,
}: {
  job: ResearchJobStatus
  compact?: boolean
}) {
  const progress = Math.max(0, Math.min(100, job.progress))
  return (
    <div className={`research-progress${compact ? ' research-progress-compact' : ''}`} data-status={job.status}>
      <svg viewBox="0 0 42 42" role="img" aria-label={`${job.phase}: ${progress}% complete`}>
        <circle className="research-progress-track" cx="21" cy="21" r="17" pathLength="100" />
        <circle
          className="research-progress-value"
          cx="21"
          cy="21"
          r="17"
          pathLength="100"
          style={{ strokeDashoffset: 100 - progress }}
        />
        <text x="21" y="23">{progress}</text>
      </svg>
      <div>
        <strong>{job.phase}</strong>
        <span>
          {job.status === 'failed'
            ? job.error ?? 'The research job failed.'
            : job.status === 'succeeded'
              ? `${job.symbol} is ready to review.`
              : `${job.symbol} · ${progress}% complete`}
        </span>
      </div>
    </div>
  )
}

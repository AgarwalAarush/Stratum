import { requireAllowedMarketUser } from '@/lib/auth/markets-session'
import { fetchMarketSystemStatus } from '@/lib/server/market-system-status'
import { fetchWorldSourceControlWorkspace } from '@/lib/server/world-source-control'
import { WorldSourceControlPanel } from '@/components/markets/WorldSourceControlPanel'

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`
  if (value < 1024 ** 2) return `${(value / 1024).toFixed(1)} KB`
  if (value < 1024 ** 3) return `${(value / 1024 ** 2).toFixed(1)} MB`
  return `${(value / 1024 ** 3).toFixed(2)} GB`
}

function formatTime(value: string | null): string {
  if (!value) return 'No completed run'
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'America/New_York',
  }).format(new Date(value))
}

export default async function MarketsSystemPage() {
  const user = await requireAllowedMarketUser()
  const [statusResult, sourceControlResult] = await Promise.allSettled([
    fetchMarketSystemStatus(),
    fetchWorldSourceControlWorkspace(user.id),
  ])
  const status = statusResult.status === 'fulfilled' ? statusResult.value : null
  const sourceControl = sourceControlResult.status === 'fulfilled' ? sourceControlResult.value : null
  return (
    <div className="market-system-page">
      <header className="market-system-heading">
        <div>
          <p className="markets-eyebrow">Ingestion, compute, and provider safeguards</p>
          <h1 className="markets-display">System status</h1>
        </div>
        <span>Updated {status ? formatTime(status.generatedAt) : 'unavailable'}</span>
      </header>

      {!status ? <p>System telemetry is unavailable because durable persistence is not configured.</p> : (
        <>
          <section className="market-system-grid" aria-label="System health">
            <article>
              <span>Worker</span>
              <strong data-state={status.worker.state}>{status.worker.state}</strong>
              <p>{status.worker.workerId ?? 'No worker recorded'} · durable heartbeat</p>
              <time>Seen {formatTime(status.worker.lastSeenAt)}</time>
            </article>
            <article>
              <span>Jobs · 24 hours</span>
              <strong>{status.jobs.succeeded}/{status.jobs.last24Hours}</strong>
              <p>{status.jobs.running} running · {status.jobs.failed} failed</p>
              <time>Durable Supabase queue</time>
            </article>
            <article>
              <span>FMP · 24 hours</span>
              <strong>{status.fmp.requestsLast24Hours.toLocaleString()}</strong>
              <p>{status.fmp.peakRecordedRequestsPerMinute}/min peak recorded</p>
              <time>{status.fmp.internalRequestsPerMinute}/min internal ceiling</time>
            </article>
            <article>
              <span>FMP · trailing 30 days</span>
              <strong>{formatBytes(status.fmp.responseBytesTrailing30Days)}</strong>
              <p>{status.fmp.bandwidthPercent.toFixed(3)}% of 20 GB</p>
              <time>{status.fmp.requestsTrailing30Days.toLocaleString()} measured requests</time>
            </article>
          </section>

          <section className="market-system-safeguards">
            <div>
              <p className="markets-eyebrow">Enforced limits</p>
              <h2>Provider headroom</h2>
            </div>
            <dl>
              <div><dt>FMP plan limit</dt><dd>{status.fmp.planRequestsPerMinute}/minute</dd></div>
              <div><dt>Stratum ceiling</dt><dd>{status.fmp.internalRequestsPerMinute}/minute</dd></div>
              <div><dt>Maximum concurrency</dt><dd>8 requests</dd></div>
              <div><dt>Throttled in 30 days</dt><dd>{status.fmp.throttledRequestsTrailing30Days}</dd></div>
              <div><dt>Market snapshots</dt><dd>7-day rolling retention</dd></div>
              <div><dt>Cross-asset snapshots</dt><dd>30-day rolling retention</dd></div>
            </dl>
          </section>

          {status.jobs.recentFailures.length > 0 ? (
            <section className="market-system-failures">
              <p className="markets-eyebrow">Requires attention</p>
              <h2>Recent worker failures</h2>
              {status.jobs.recentFailures.map((failure) => (
                <article key={`${failure.at}:${failure.error}`}>
                  <time>{formatTime(failure.at)}</time>
                  <p>{failure.error}</p>
                </article>
              ))}
            </section>
          ) : null}

        </>
      )}
      <WorldSourceControlPanel workspace={sourceControl} unavailableReason={sourceControlResult.status === 'rejected' ? 'Source-control persistence is unavailable.' : null} />
    </div>
  )
}

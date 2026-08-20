import Link from 'next/link'
import { requireAllowedMarketUser } from '@/lib/auth/markets-session'
import { fetchCausalModelSnapshot } from '@/lib/server/causal-model'
import { OwnerReviewActions } from '@/components/markets/OwnerReviewActions'

function text(value: unknown, fallback = '—'): string {
  return typeof value === 'string' && value.trim() ? value : fallback
}

function number(value: unknown): number { return Number.isFinite(Number(value)) ? Number(value) : 0 }

export default async function MarketsReviewPage() {
  await requireAllowedMarketUser()
  const snapshot = await fetchCausalModelSnapshot()
  const queue = snapshot.pendingReviews.slice(0, 10)
  return <div className="owner-review-page">
    <header className="owner-review-header">
      <div><p className="markets-eyebrow">Owner review</p><h1 className="owner-review-title">Decisions, not another feed.</h1><p>Only material deltas appear here. Evidence can keep accumulating behind one open item; it never replaces your unreviewed decision.</p></div>
      <aside><span>Weekly capacity</span><strong>{queue.length} / 10 open</strong><small>Urgent falsifiers can still interrupt.</small></aside>
    </header>

    <section className="owner-review-queue" aria-labelledby="review-queue-heading">
      <div className="owner-review-section-heading"><div><p className="markets-eyebrow">Needs your decision</p><h2 id="review-queue-heading">The bounded queue</h2></div><span>{queue.reduce((total, item) => total + number(item.attention_minutes), 0)} minutes</span></div>
      {queue.length === 0 ? <div className="owner-review-empty"><strong>No decision is waiting.</strong><p>World and thesis monitoring continue in the background; only a material, reviewable change appears here.</p><Link href="/markets/world">Inspect World coverage →</Link></div> : <div className="owner-review-list">
        {queue.map((item) => <article key={text(item.id)} className="owner-review-item">
          <div className="owner-review-item-top"><span>{text(item.decision_type).replaceAll('_', ' ')}</span><span>{number(item.attention_minutes)} min · priority {number(item.priority)}</span></div>
          <div className="owner-review-item-body"><div><h3>{text(item.title)}</h3><dl><div><dt>Changed</dt><dd>{text(item.what_changed)}</dd></div><div><dt>Why now</dt><dd>{text(item.why_now)}</dd></div><div><dt>If ignored</dt><dd>{text(item.if_ignored)}</dd></div></dl></div><OwnerReviewActions itemId={text(item.id)} decisionType={text(item.decision_type)} /></div>
        </article>)}
      </div>}
    </section>

    <section className="owner-review-context" aria-label="Causal model context">
      <div><p className="markets-eyebrow">World clock</p><h2>Slow-moving causal state</h2><p>{snapshot.world.length} active or shadow World model versions are available for context. They are not company theses.</p><Link href="/markets/world">Open World →</Link></div>
      <div><p className="markets-eyebrow">Thesis clock</p><h2>Durable market beliefs</h2><p>{snapshot.marketTheses.length} current market-thesis versions share the causal contract, while retaining their independent research lineage.</p><Link href="/markets/theses">Open Theses →</Link></div>
    </section>
  </div>
}

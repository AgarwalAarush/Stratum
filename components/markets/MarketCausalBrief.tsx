import Link from 'next/link'

type Model = Record<string, unknown>

function text(value: unknown, fallback = '—'): string { return typeof value === 'string' && value.trim() ? value : fallback }

export function MarketCausalBrief({ world, marketTheses }: { world: Model[]; marketTheses: Model[] }) {
  const changes = world.slice(0, 3)
  return <section className="market-causal-brief" aria-labelledby="market-causal-brief-title">
    <header><div><p className="markets-eyebrow">Causal regime</p><h2 id="market-causal-brief-title">The world model beside the tape</h2></div><span>World is {changes.some((item) => item.state === 'shadow') ? 'shadow-evaluated' : 'canonical'}</span></header>
    <div className="market-causal-brief-grid">
      <div><p className="market-causal-label">World</p>{changes.length ? changes.map((item) => <Link href="/markets/world" key={text(item.id)}><strong>{text(item.title)}</strong><span>{text(item.summary)}</span></Link>) : <p className="market-causal-empty">No projected World change is available yet.</p>}</div>
      <div><p className="market-causal-label">Beliefs</p>{marketTheses.length ? marketTheses.slice(0, 3).map((item) => <Link href="/markets/theses" key={text(item.id)}><strong>{text(item.title)}</strong><span>{text(item.summary)}</span></Link>) : <p className="market-causal-empty">No current market-thesis projection.</p>}</div>
    </div>
    <footer><span>Tape explains hours. World explains weeks and months. Theses retain durable, reviewable beliefs.</span><Link href="/markets/review">Open decision queue →</Link></footer>
  </section>
}

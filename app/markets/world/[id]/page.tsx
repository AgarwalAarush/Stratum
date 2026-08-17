import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireAllowedMarketUser } from '@/lib/auth/markets-session'
import { fetchWorldNode } from '@/lib/server/world-projection'
import { WorldMarkdown } from '@/components/markets/WorldMarkdown'

export default async function WorldNodePage({ params }: { params: Promise<{ id: string }> }) {
  await requireAllowedMarketUser()
  const { id } = await params
  const result = await fetchWorldNode(id)
  if (!result) notFound()
  return (
    <article className="world-node-page">
      <header>
        <Link href="/markets/world" className="world-back-link">World / {result.node.kind}</Link>
        <p className="markets-eyebrow">{result.node.status} · {result.node.importance} impact · {result.node.confidence}% confidence</p>
        <h1>{result.node.title}</h1>
        <p>{result.node.summary}</p>
        <small>Commit {result.commit.slice(0, 10)} · as of {new Date(result.node.asOf).toLocaleString('en-US', { timeZone: 'America/New_York' })}</small>
      </header>
      <section><h2>Assessment</h2><WorldMarkdown className="world-node-prose">{result.node.body}</WorldMarkdown></section>
      <section><h2>Claims and source lineage</h2>{result.node.claims.length ? <ul>{result.node.claims.map((claim, index) => <li key={`${index}:${claim.text}`}>{claim.assessment ? <strong>Assessment: </strong> : null}{claim.text}<small>{claim.sourceIds.join(', ')}</small></li>)}</ul> : <p>No established factual claims.</p>}</section>
      <section><h2>Relationships</h2>{result.related.length ? <div className="world-related-list">{result.related.map((node) => <Link href={`/markets/world/${encodeURIComponent(node.id)}`} key={node.id}><span>{node.kind}</span><strong>{node.title}</strong><p>{node.summary}</p></Link>)}</div> : <p>No projected relationships.</p>}</section>
      <section><h2>Source ledger</h2>{result.sources.length ? <ul className="world-source-list">{result.sources.map((source) => <li key={String(source.source_id)}><a href={String(source.url)} target="_blank" rel="noreferrer">{String(source.title)}</a><span>{String(source.publisher ?? '')} · {String(source.claim_state)}</span></li>)}</ul> : <p>No source rows were projected for this node.</p>}</section>
    </article>
  )
}

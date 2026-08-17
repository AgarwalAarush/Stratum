import { CandidateActions } from './CandidateActions'
import { MarketsIntentLink } from './MarketsIntentLink'
import type { CandidateBrief } from '@/lib/markets/types'

const LANE_LABELS: Record<CandidateBrief['primaryLane'], string> = {
  market_thesis: 'Market-model exposure',
  thesis_led: 'Thesis-led review',
  dislocation: 'Possible overreaction',
  fundamental_inflection: 'Fundamental inflection',
  leadership: 'Market leadership',
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/New_York',
  }).format(new Date(value))
}

export function CandidateScout({ candidates }: { candidates: CandidateBrief[] }) {
  const dataAsOf = candidates[0]?.tradingDate ?? null
  return (
    <section className="candidate-scout-page" aria-labelledby="candidate-scout-heading">
      <header className="candidate-scout-heading">
        <div>
          <p className="markets-eyebrow">Screening evidence, not trade instructions</p>
          <h1 id="candidate-scout-heading" className="markets-display">Candidate Scout</h1>
          <p>Names worth investigating now. A candidate can become research, then a reviewable thesis, and only then a separate capital decision.</p>
        </div>
        <span>{dataAsOf ? `${candidates.length} current briefs · ${formatDate(dataAsOf)}` : 'Awaiting the next post-close scan'}</span>
      </header>

      {candidates.length > 0 ? <div className="candidate-scout-list">
        {candidates.map((candidate) => (
          <article key={candidate.id} className="candidate-scout-card">
            <header>
              <div>
                <p className="markets-eyebrow">{LANE_LABELS[candidate.primaryLane]}</p>
                <h2><MarketsIntentLink href={`/markets/stocks/${candidate.symbol}`}>{candidate.symbol}</MarketsIntentLink></h2>
                <span>{candidate.company} · {candidate.subIndustry}</span>
              </div>
              <time dateTime={candidate.generatedAt}>{formatDate(candidate.generatedAt)}</time>
            </header>
            <p className="candidate-scout-reason">{candidate.whySurfaced}</p>
            <div className="candidate-scout-details">
              <div><span>What changed</span><p>{candidate.whatChanged[0] ?? 'The source signal has not yet been summarized.'}</p></div>
              <div><span>Question before acting</span><p>{candidate.nextResearchQuestion}</p></div>
              <div><span>Next catalyst</span><p>{candidate.catalyst}</p></div>
            </div>
            <footer>
              <MarketsIntentLink href={`/markets/stocks/${candidate.symbol}`}>Open dossier →</MarketsIntentLink>
              <CandidateActions candidateId={candidate.id} />
            </footer>
          </article>
        ))}
      </div> : <section className="candidate-scout-empty">
        <h2>No current candidate briefs</h2>
        <p>Candidate Scout runs after the market-leadership snapshot completes on trading days. It needs a complete screener and leadership snapshot before it will surface names.</p>
        <MarketsIntentLink href="/markets/system">Check the data pipeline →</MarketsIntentLink>
      </section>}
    </section>
  )
}

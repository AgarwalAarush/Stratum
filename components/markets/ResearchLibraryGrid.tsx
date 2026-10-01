'use client'

import { useState } from 'react'
import { MagnifyingGlass } from '@phosphor-icons/react'
import type { ResearchLibraryEntry } from '@/lib/server/research-library'
import { formatMarketDate } from '@/lib/markets/format-date'
import { formatEntryAction } from '@/lib/markets/research-presentation'
import { MarketsIntentLink } from './MarketsIntentLink'
import styles from './ResearchLibraryGrid.module.css'

export function ResearchLibraryGrid({ notes }: { notes: ResearchLibraryEntry[] }) {
  const [query, setQuery] = useState('')
  const search = query.trim().toLowerCase()
  const visibleNotes = notes.filter((note) => `${note.symbol} ${note.keyDebate}`.toLowerCase().includes(search))

  return <section aria-labelledby="research-library-title">
    <header className={styles.heading}>
      <div><h2 id="research-library-title">Saved research</h2><p>Newest versions first · Reports open the latest company or fund assessment.</p></div>
      <label className={styles.search}><MagnifyingGlass size={16} aria-hidden="true" /><span className="sr-only">Search saved research</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search symbols or questions" /></label>
    </header>
    <p className={styles.count} role="status">{search ? `${visibleNotes.length} of ${notes.length} reports` : `${notes.length} saved reports`}</p>
    <div className={styles.grid}>
      {visibleNotes.map((note) => <MarketsIntentLink key={note.id} href={`/markets/stocks/${note.symbol}/research`} className={styles.report}>
        <div className={styles.identity}><strong>{note.symbol}</strong><span>v{note.version} · {note.status}</span></div>
        <h3>{note.keyDebate || `${note.symbol} research assessment`}</h3>
        <footer><span><small>Rating</small>{note.formalRating}</span><span><small>Entry</small>{formatEntryAction(note.entryAction)}</span><time dateTime={note.generatedAt}>{formatMarketDate(note.generatedAt)}</time></footer>
      </MarketsIntentLink>)}
    </div>
    {visibleNotes.length === 0 && <div className={styles.empty}><h3>{search ? 'No matching reports' : 'Your research library starts here'}</h3><p>{search ? 'Try another symbol or a shorter search.' : 'Open a stock or promote a Candidate Scout brief to generate a full report.'}</p>{search ? <button type="button" onClick={() => setQuery('')}>Clear search</button> : <MarketsIntentLink href="/markets/candidates">Open Candidate scout →</MarketsIntentLink>}</div>}
  </section>
}

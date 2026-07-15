import { ArrowSquareOut } from '@phosphor-icons/react/dist/ssr'
import type { NewsItem } from '@/lib/types'

interface MarketsFeedPageProps {
  eyebrow: string
  title: string
  description: string
  items: NewsItem[]
  emptyMessage: string
}

function formatTimestamp(value: string): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'America/New_York',
  }).format(new Date(value))
}

export function MarketsFeedPage({ eyebrow, title, description, items, emptyMessage }: MarketsFeedPageProps) {
  const categories = [...new Set(items.map((item) => item.category ?? 'Markets'))]

  return (
    <section className="markets-feed-page" aria-labelledby="markets-feed-title">
      <header className="markets-feed-heading">
        <p className="markets-eyebrow">{eyebrow}</p>
        <h1 id="markets-feed-title" className="markets-display">{title}</h1>
        <p>{description}</p>
      </header>

      <div className="markets-feed-meta">
        <span>{items.length} current signals</span>
        <span>Private preview · API and RSS sources</span>
      </div>

      {items.length === 0 ? (
        <div className="markets-feed-empty">
          <p className="markets-eyebrow">No current items</p>
          <h2>{emptyMessage}</h2>
          <p>The page will populate automatically when an upstream source returns a current, valid record.</p>
        </div>
      ) : (
        <div className="markets-feed-layout">
          <aside className="markets-feed-index" aria-label="Feed categories">
            <p>Coverage</p>
            <ul>{categories.map((category) => <li key={category}>{category}</li>)}</ul>
          </aside>

          <ol className="markets-feed-list">
            {items.map((item, index) => (
              <li key={item.id}>
                <span className="markets-feed-number">{String(index + 1).padStart(2, '0')}</span>
                <div className="markets-feed-item-copy">
                  <div className="markets-feed-item-meta">
                    <span>{item.category ?? 'Markets'}</span>
                    <span>{item.source}</span>
                    <time dateTime={item.publishedAt}>{formatTimestamp(item.publishedAt)} ET</time>
                  </div>
                  <h2>{item.title}</h2>
                </div>
                <a href={item.url} target="_blank" rel="noreferrer" aria-label={`Open ${item.title}`}>
                  <ArrowSquareOut size={18} aria-hidden="true" />
                </a>
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  )
}

import Link from 'next/link'

interface MarketsPlaceholderProps {
  eyebrow: string
  title: string
  description: string
}

export function MarketsPlaceholder({ eyebrow, title, description }: MarketsPlaceholderProps) {
  return (
    <section className="markets-placeholder" aria-labelledby="placeholder-title">
      <p className="markets-eyebrow">{eyebrow}</p>
      <h1 id="placeholder-title" className="markets-display markets-placeholder-title">
        {title}
      </h1>
      <p className="markets-placeholder-copy">{description}</p>
      <Link href="/markets" className="markets-text-link">
        Return to market overview <span aria-hidden="true">→</span>
      </Link>
    </section>
  )
}

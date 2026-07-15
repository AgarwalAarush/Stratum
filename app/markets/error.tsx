'use client'

export default function MarketsError({ reset }: { reset: () => void }) {
  return (
    <section className="markets-placeholder" role="alert">
      <p className="markets-eyebrow">Markets unavailable</p>
      <h1 className="markets-display markets-placeholder-title">The latest view could not be loaded</h1>
      <p className="markets-placeholder-copy">The previous completed snapshot remains safe. Retry this view without starting a new ingestion run.</p>
      <button type="button" className="markets-primary-button" onClick={reset}>Retry</button>
    </section>
  )
}
